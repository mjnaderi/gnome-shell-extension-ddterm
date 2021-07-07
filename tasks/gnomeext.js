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

/*
 * At some point, this file should become a standalone Gulp plugin.
 *
 * TODO: all commands read input data from the file on disk, not from Vinyl.
 * At least, check that the content matches.
 */

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

const logger = require('gulplog');
const PluginError = require('plugin-error');
const { src } = require('gulp');
const vfs = require('vinyl-fs');

const PLUGIN_NAME = 'gulp-gnomeext';

const METADATA_FILE_NAME = 'metadata.json';
exports.METADATA_FILE_NAME = METADATA_FILE_NAME;

const DEFAULT_SOURCES = [
    'extension.js',
    'prefs.js',
    METADATA_FILE_NAME,
];
exports.DEFAULT_SOURCES = DEFAULT_SOURCES;

async function loadMetadata(filePath = METADATA_FILE_NAME) {
    try {
        const data = await fs.promises.readFile(filePath);
        return JSON.parse(data);
    } catch (ex) {
        throw new PluginError(PLUGIN_NAME, ex);
    }
}

exports.loadMetadata = loadMetadata;

function getPackageFileName(uuid) {
    return `${uuid}.shell-extension.zip`;
}

exports.getPackageFileName = getPackageFileName;

function quoteArg(arg) {
    const unsafe = /[^\w@%+=:,./-]/;
    if (!arg)
        return "''";

    if (!unsafe.test(arg))
        return arg;

    return `'${arg.replaceAll("'", "'\"'\"'")}'`;
}

function runProcess(argv, getStdout = false) {
    const cmd = argv.map(quoteArg).join(' ');
    logger.debug('Running command: %s', cmd);

    return new Promise((resolve, reject) => {
        const proc = child_process.execFile(argv[0], argv.slice(1), {}, (error, stdout, stderr) => {
            if (error) {
                reject(new PluginError(PLUGIN_NAME, error));
                return;
            }

            if (proc.signalCode) {
                const errprefix = stderr ? `${stderr}\n\n` : '';
                reject(new PluginError(PLUGIN_NAME, `${errprefix}${cmd} killed by signal ${proc.signalCode}`));
                return;
            }

            if (proc.exitCode) {
                const errprefix = stderr ? `${stderr}\n\n` : '';
                reject(new PluginError(PLUGIN_NAME, `${errprefix}${cmd} exited with code ${proc.exitCode}`));
                return;
            }

            if (stderr)
                logger.info('%s:\n%s', cmd, stderr);

            if (getStdout)
                resolve(Buffer.from(stdout, proc.stdout.readableEncoding));
            else
                resolve();
        });
    });
}

const COMPILED_SCHEMAS_FILE_NAME = 'gschemas.compiled';
const SCHEMA_FILE_SUFFIX = '.gschema.xml';
const SCHEMA_FILE_GLOB = `*${SCHEMA_FILE_SUFFIX}`;
exports.COMPILED_SCHEMAS_FILE_NAME = COMPILED_SCHEMAS_FILE_NAME;
exports.SCHEMA_FILE_SUFFIX = SCHEMA_FILE_SUFFIX;
exports.SCHEMA_FILE_GLOB = SCHEMA_FILE_GLOB;

function schemaSrc(dir, opts) {
    return src(path.join(dir, SCHEMA_FILE_GLOB), opts);
}

exports.schemaSrc = schemaSrc;

function compiledSchemasPath(dir) {
    return path.join(dir, COMPILED_SCHEMAS_FILE_NAME);
}

exports.compiledSchemasPath = compiledSchemasPath;

function takeFiles(glob, outStream, opts) {
    return new Promise((resolve, reject) => {
        const srcStream = vfs.src(glob, opts);
        srcStream.on('data', p => outStream.push(p));
        srcStream.on('error', err => reject(new PluginError(PLUGIN_NAME, err)));
        srcStream.on('end', resolve);
    });
}

/* TODO: use resolve-options? */
function compileSchemas(opts) {
    opts = opts || {};

    const sources = [];
    let targetdir = opts.targetdir ? path.resolve(opts.targetdir) : null;

    return new stream.Transform({
        transform(data, enc, callback) {
            if (!data.basename.endsWith(SCHEMA_FILE_SUFFIX)) {
                callback(new PluginError(PLUGIN_NAME, `Invalid schema file name: ${data.basename} doesn't end with ${SCHEMA_FILE_SUFFIX}!`));
                return;
            }

            if (sources.length > 0 && sources[0].dirname !== data.dirname) {
                callback(new PluginError(PLUGIN_NAME, `Can't compile schemas from multiple directories at once (${sources[0].dirname} and ${data.dirname})`));
                return;
            }

            sources.push(data);

            if (!targetdir)
                targetdir = data.dirname;

            callback();
        },
        flush(callback) {
            if (sources.length === 0) {
                callback();
                return;
            }

            const args = [`--targetdir=${targetdir}`];
            const targetPath = compiledSchemasPath(targetdir);

            if (opts.strict)
                args.push('--strict');

            if (opts.dry_run)
                args.push('--dry-run');

            args.push(sources[0].dirname);

            let p = runProcess(['glib-compile-schemas', ...args]);

            if (!opts.dry_run)
                p = p.then(() => takeFiles(targetPath, this, { encoding: false }));

            p.then(callback, callback);
        },
        objectMode: true,
    });
}

exports.compileSchemas = compileSchemas;

function builderToolForGtk(version) {
    version = version.toString();

    if (version === '3')
        return 'gtk-builder-tool';

    if (version === '4')
        return 'gtk4-builder-tool';

    throw new PluginError(PLUGIN_NAME, `Unknown Gtk version: ${version}`);
}

function validateUi(gtkVersion) {
    const tool = builderToolForGtk(gtkVersion);

    return new stream.Transform({
        transform(data, enc, callback) {
            runProcess([tool, 'validate', data.path]).then(callback, callback);
        },
        objectMode: true,
    });
}

exports.validateUi = validateUi;

function _simplifyUi(gtkVersion, extraArgs) {
    const tool = builderToolForGtk(gtkVersion);

    return new stream.Transform({
        transform(data, enc, callback) {
            runProcess([tool, 'simplify', ...extraArgs, data.path], true)
                .then(buf => {
                    data.contents = buf;
                    this.push(data);
                    callback();
                }, callback);
        },
        objectMode: true,
    });
}

function simplifyUi(gtkVersion) {
    return _simplifyUi(gtkVersion, []);
}

exports.simplifyUi = simplifyUi;

function ui3to4() {
    return _simplifyUi(4, ['--3to4']);
}

exports.ui3to4 = ui3to4;

function pack(opts) {
    opts = opts || {};

    const args = [];
    const sourceDir = path.resolve(opts.sourceDir || '.');
    const outDir = path.resolve(opts.outDir || '.');
    let hasInput = false;

    return new stream.Transform({
        transform(data, enc, callback) {
            if (data.basename.endsWith('.gschema.xml'))
                args.push(`--schema=${data.path}`);

            else if (!DEFAULT_SOURCES.includes(data.basename) || path.resolve(data.dirname) !== sourceDir)
                args.push(`--extra-source=${data.path}`);

            /* All sources may be from DEFAULT_SOURCES - so args may be empty */
            hasInput = true;
            callback();
        },
        flush(callback) {
            if (!hasInput) {
                callback();
                return;
            }

            loadMetadata(path.join(sourceDir, METADATA_FILE_NAME)).then(json => {
                return runProcess(['gnome-extensions', 'pack', '-f', '-o', outDir, ...args, sourceDir]).then(
                    () => takeFiles(path.join(outDir, getPackageFileName(json.uuid)), this, { encoding: false })
                );
            }).then(callback, callback);
        },
        objectMode: true,
    });
}

exports.pack = pack;

function install(opts) {
    opts = opts || {};

    const args = [];

    if (opts.force)
        args.push('-f');

    return new stream.Writable({
        write(data, enc, callback) {
            runProcess(['gnome-extensions', 'install', ...args, data.path]).then(callback, callback);
        },
        objectMode: true,
    });
}

exports.install = install;
