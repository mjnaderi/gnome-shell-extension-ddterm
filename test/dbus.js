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

'use strict';

/* exported enable disable */

const { GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Extension = Me.imports.extension;

function return_rect_dbus(rect) {
    if (!rect)
        return [0, 0, 0, 0];

    return [rect.x, rect.y, rect.width, rect.height];
}

function exception_to_dbus(invocation, e) {
    if (e instanceof GLib.Error) {
        invocation.return_gerror(e);
    } else {
        let name = e.name;
        if (!name.includes('.')) {
            // likely to be a normal JS error
            name = `org.gnome.gjs.JSError.${name}`;
        }
        logError(e, `Exception in method call: ${invocation.get_interface_name()}.${invocation.get_method_name()} on ${invocation.get_object_path()}`);
        invocation.return_dbus_error(name, `${e}\n\n${e.stack}`);
    }
}

class ExtensionTestDBusInterface {
    constructor() {
        let [_, xml] = Me.dir.get_child('test').get_child('com.github.amezin.ddterm.ExtensionTest.xml').load_contents(null);
        this.dbus = Gio.DBusExportedObject.wrapJSObject(ByteArray.toString(xml), this);
    }

    emit_property_changed(name) {
        const signature = this.dbus.get_info().lookup_property(name).signature;
        this.dbus.emit_property_changed(name, new GLib.Variant(signature, this[name]));
    }

    get MonitorCount() {
        return global.display.get_n_monitors();
    }

    get PrimaryMonitorIndex() {
        return Main.layoutManager.primaryIndex;
    }

    get HasWindow() {
        return !!Extension.current_window;
    }

    get WindowRect() {
        const win = Extension.current_window;
        return return_rect_dbus(win && win.get_frame_rect());
    }

    get Workarea() {
        return return_rect_dbus(Extension.current_workarea);
    }

    get MaximizedVertically() {
        const win = Extension.current_window;
        return win && win.maximized_vertically;
    }

    get MaximizedHorizontally() {
        const win = Extension.current_window;
        return win && win.maximized_horizontally;
    }

    PrepareAsync(params, invocation) {
        disable_welcome_dialog().then(
            () => invocation.return_value(null)
        ).catch(ex => exception_to_dbus(invocation, ex));
    }

    GetSetting(key) {
        return Extension.settings.get_value(key);
    }

    SetSettingAsync(params, invocation) {
        set_setting(...params).then(
            () => invocation.return_value(null)
        ).catch(ex => exception_to_dbus(invocation, ex));
    }
}

const DBUS_INTERFACE = new ExtensionTestDBusInterface();

const extension_handlers = new Extension.ConnectionSet();
const window_handlers = new Extension.ConnectionSet();

function enable() {
    DBUS_INTERFACE.dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ddterm');
    extension_handlers.connect(Extension, 'window-changed', setup_window);
    extension_handlers.connect(Extension, 'window-changed', emit_new_window_signals);
    extension_handlers.connect(Extension.settings, 'changed',
        (_, key) => DBUS_INTERFACE.dbus.emit_signal('SettingChanged', new GLib.Variant('(s)', key))
    );
}

function disable() {
    DBUS_INTERFACE.dbus.unexport();
    extension_handlers.disconnect();
}

function disable_welcome_dialog() {
    return new Promise(resolve => {
        if (global.settings.settings_schema.has_key('welcome-dialog-last-shown-version'))
            global.settings.set_string('welcome-dialog-last-shown-version', '99.0');

        if (!Main.welcomeDialog) {
            resolve();
            return;
        }

        const ModalDialog = imports.ui.modalDialog;
        if (Main.welcomeDialog.state === ModalDialog.State.CLOSED) {
            resolve();
            return;
        }

        const handler_id = Main.welcomeDialog.connect('closed', () => {
            Main.welcomeDialog.disconnect(handler_id);
            resolve();
        });
        Main.welcomeDialog.close();
    });
}

function set_setting(key, value) {
    return new Promise(resolve => {
        const check_value = () => {
            if (!Extension.settings.get_value(key).equal(value))
                return false;

            Extension.settings.disconnect(handler_id);
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            return true;
        };

        const handler_id = Extension.settings.connect(`changed::${key}`, check_value);

        if (check_value())
            return;

        Extension.settings.set_value(key, value);
    });
}

function emit_new_window_signals() {
    DBUS_INTERFACE.emit_property_changed('HasWindow');
    DBUS_INTERFACE.emit_property_changed('WindowRect');
    DBUS_INTERFACE.emit_property_changed('MaximizedVertically');
    DBUS_INTERFACE.emit_property_changed('MaximizedHorizontally');
}

function setup_window() {
    window_handlers.disconnect();

    const win = Extension.current_window;
    if (!win)
        return;

    window_handlers.connect(win, 'position-changed', () => {
        DBUS_INTERFACE.emit_property_changed('WindowRect');
    });

    window_handlers.connect(win, 'size-changed', () => {
        DBUS_INTERFACE.emit_property_changed('WindowRect');
    });

    window_handlers.connect(win, 'notify::maximized-vertically', () => {
        DBUS_INTERFACE.emit_property_changed('MaximizedVertically');
    });

    window_handlers.connect(win, 'notify::maximized-horizontally', () => {
        DBUS_INTERFACE.emit_property_changed('MaximizedHorizontally');
    });
}
