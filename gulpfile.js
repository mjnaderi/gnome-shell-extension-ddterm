/*
    Copyright © 2021 Aleksandr Mezin

    This file is part of ddterm GNOME Shell extension.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const { src, dest, parallel, series } = require('gulp');
const del = require('del');
const exec = require('gulp-exec');
const filter = require('gulp-filter');
const fs = require('fs');
const logger = require('gulplog');
const minimist = require('minimist');
const newer = require('gulp-newer');
const path = require('path');
const pumpify = require('pumpify');
const rename = require('gulp-rename');
const stream = require('stream');
const vinylPaths = require('vinyl-paths');

const metadata = require('./metadata.json');
const gnomeext = require('./tasks/gnomeext.js');

/* TODO: replace with yargs - which are already a dependency of gulp */
const options = minimist(process.argv.slice(2), {
    boolean: ['gtk4'],
    default: { gtk4: true },
});

/* helpers */

function transformFiles(transform, destDir = '.', outName = null) {
    return pumpify.obj(
        newer(outName ? path.join(destDir, outName) : destDir),
        transform,
        outName ? rename(outName) : new stream.PassThrough({ objectMode: true }),
        dest(destDir)
    );
}

function fakeDest(destDir) {
    destDir = path.resolve(destDir);

    return new stream.Transform({
        transform(data, enc, callback) {
            data.dirname = destDir;
            callback(null, data);
        },
        objectMode: true,
    });
}

const INTERMEDIATE_DIR = 'tmp';

function saveIntermediate(name, dir = INTERMEDIATE_DIR) {
    return pumpify.obj(rename(name), dest(dir));
}

/* Glade/GtkBuilder UI */

const PREFS_GLADE_INPUT = 'glade/prefs.ui';

function gladeGtk3OnlyUi(opts) {
    return src(['glade/*.ui', `!${PREFS_GLADE_INPUT}`], opts);
}

function buildUiGtk3Only() {
    return gladeGtk3OnlyUi({ read: false }).pipe(transformFiles(
        gnomeext.simplifyUi(3)
    ));
}

const PREFS_GTK3_OUTPUT = 'prefs-gtk3.ui';

function buildPrefsUiGtk3() {
    return src(PREFS_GLADE_INPUT, { read: false }).pipe(transformFiles(
        gnomeext.simplifyUi(3), '.', PREFS_GTK3_OUTPUT
    ));
}

function gtk3OnlyUiOutput(opts) {
    return gladeGtk3OnlyUi(opts).pipe(fakeDest('.'));
}

function allGtk3UiOutput(opts) {
    return gtk3OnlyUiOutput(opts).pipe(src(PREFS_GTK3_OUTPUT, opts));
}

const PREFS_GTK4_OUTPUT = 'prefs-gtk4.ui';

function buildPrefsUiGtk4FromGtk3() {
    return src(PREFS_GTK3_OUTPUT, { read: false }).pipe(transformFiles(pumpify.obj(
        gnomeext.ui3to4(),
        saveIntermediate('prefs-3to4.ui'),
        exec(file => `xsltproc 3to4-fixup.xsl ${file.path}`, { pipeStdout: true }),
        exec.reporter({ stdout: false }),
        saveIntermediate('prefs-3to4-fixup.ui'),
        gnomeext.simplifyUi(4)
    ), '.', PREFS_GTK4_OUTPUT));
}

function allUiOutput(opts) {
    return allGtk3UiOutput(opts).pipe(src(PREFS_GTK4_OUTPUT, opts));
}

function currentUiOutput(opts) {
    if (options.gtk4)
        return allUiOutput(opts);

    return allGtk3UiOutput(opts);
}

exports.buildUi = parallel(
    buildUiGtk3Only,
    options.gtk4 ? series(buildPrefsUiGtk3, buildPrefsUiGtk4FromGtk3) : buildPrefsUiGtk3
);

function validateGtk3Ui() {
    return allGtk3UiOutput({ read: false })
        .pipe(filter(['**', '!terminalpage.ui']))
        .pipe(gnomeext.validateUi(3));
}

function validateGtk4Ui() {
    return src(PREFS_GTK4_OUTPUT, { read: false })
        .pipe(gnomeext.validateUi(4));
}

exports.validateUi = series(
    exports.buildUi,
    options.gtk4 ? series(validateGtk3Ui, validateGtk4Ui) : validateGtk3Ui
);

/* Bundled libraries */

const HANDLEBARS_FILE = 'handlebars.js';

function bundleHandlebars() {
    return src('node_modules/handlebars/dist/handlebars.min.js')
        .pipe(rename(HANDLEBARS_FILE))
        .pipe(dest('.'));
}

exports.bundleLibs = bundleHandlebars;

function bundledLibsOutput(opts) {
    return src(HANDLEBARS_FILE, opts);
}

exports.preparePackSources = parallel(exports.bundleLibs, exports.buildUi);

/* GSettings schema */

const SCHEMAS_DIR = 'schemas';
const COMPILED_SCHEMAS_PATH = gnomeext.compiledSchemasPath(SCHEMAS_DIR);

function compileSchemas() {
    return gnomeext.schemaSrc(SCHEMAS_DIR, { read: false })
        .pipe(newer(COMPILED_SCHEMAS_PATH))
        .pipe(gnomeext.compileSchemas({ strict: true }));
}

exports.compileSchemas = compileSchemas;

/* Symlink install */

function getXdgDataDir() {
    const fromEnv = process.env.XDG_DATA_HOME;
    if (fromEnv)
        return fromEnv;

    return path.join(process.env.HOME, '.local', 'share');
}

const installPath = path.join(getXdgDataDir(), 'gnome-shell', 'extensions', metadata.uuid);

exports.prepareRunInplace = parallel(exports.preparePackSources, exports.compileSchemas);

async function symlinkUninstall() {
    const stat = await fs.promises.lstat(installPath);
    if (stat.isSymbolicLink())
        await fs.promises.unlink(installPath);
}

exports.symlinkUninstall = symlinkUninstall;

async function symlinkInstall() {
    await fs.promises.symlink(path.resolve('.'), installPath, 'dir');
}

exports.symlinkInstall = series(exports.prepareRunInplace, symlinkUninstall, symlinkInstall);

/* Extension package */

const packageFile = gnomeext.getPackageFileName(metadata.uuid);

const AUX_SOURCES = [
    'metadata.json',
    'LICENSE',
    'menus.ui',
    'com.github.amezin.ddterm',
    'com.github.amezin.ddterm.Extension.xml',
    'style.css',
];

function traceStream(prefix) {
    return new stream.Transform({
        transform(data, enc, callback) {
            logger.debug('%s: %s', prefix, data.path);
            callback(null, data);
        },
        objectMode: true,
    });
}

function packSources(opts) {
    return currentUiOutput(opts)
        .pipe(src('*.js', opts))
        .pipe(filter(['**', '!gulpfile.js', '!test-prefs-gtk4.js', '!extension_tests.js']))
        .pipe(gnomeext.schemaSrc(SCHEMAS_DIR, opts))
        .pipe(src(AUX_SOURCES, opts));
}

function pack() {
    return packSources({ read: false }).pipe(newer(packageFile)).pipe(gnomeext.pack());
}

exports.pack = series(exports.preparePackSources, pack);

function install() {
    return src(packageFile, { read: false }).pipe(gnomeext.install({ force: true }));
}

exports.install = series(exports.pack, symlinkUninstall, install);

/* Clean */

function allOutput(opts) {
    return allUiOutput(opts)
        .pipe(bundledLibsOutput(opts))
        .pipe(src(COMPILED_SCHEMAS_PATH, opts))
        .pipe(src(packageFile, opts))
        .pipe(src(INTERMEDIATE_DIR, opts));
}

function clean() {
    return allOutput({
        read: false,
        allowEmpty: true,
    }).pipe(vinylPaths(del));
}

exports.clean = clean;

exports.default = exports.buildUi;
