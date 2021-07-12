import json
import logging
import pathlib
import shlex
import subprocess

from gi.repository import Gio
import pytest


DEFAULT_IMAGE = 'ghcr.io/amezin/gnome-shell-pod-34:master'
DEFAULT_SESSION = 'gnome-xsession'

SRC_DIR = (pathlib.Path(__file__).parent / '..').resolve()
EXTENSION_UUID = 'ddterm@amezin.github.com'
PKG_PATH = f'/home/gnomeshell/.local/share/gnome-shell/extensions/{EXTENSION_UUID}'


def pytest_addoption(parser):
    parser.addoption('--image', default=DEFAULT_IMAGE)
    parser.addoption('--gnome-session', default=DEFAULT_SESSION)
    parser.addoption('--podman', default='podman')


class Container:
    def __init__(self, podman, container_id):
        self.container_id = container_id
        self.podman = podman
        self.exec_args = ['exec', '--user', 'gnomeshell', self.container_id, 'set-env.sh']

    def exec(self, *args, **kwargs):
        return self.podman(*self.exec_args, *args, **kwargs)

    def inspect(self):
        return json.loads(self.podman('inspect', self.container_id, stdout=subprocess.PIPE).stdout)


@pytest.fixture(scope='session')
def podman_cmd(pytestconfig):
    return shlex.split(pytestconfig.option.podman)


@pytest.fixture(scope='session')
def podman(podman_cmd):
    def run(*args, **kwargs):
        kwargs.setdefault('check', True)
        cmd = podman_cmd + list(args)
        cmd_str = shlex.join(cmd)
        logging.info('Running: %s', cmd_str)
        proc = subprocess.run(cmd, **kwargs)
        logging.info('Done: %s', cmd_str)
        return proc

    return run


@pytest.fixture(scope='session')
def container(podman, pytestconfig):
    container_id = podman(
        'run', '--rm', '-Ptd', '--cap-add', 'SYS_NICE', '--cap-add', 'IPC_LOCK',
        '-v', f'{SRC_DIR}:{PKG_PATH}:ro', pytestconfig.option.image,
        stdout=subprocess.PIPE, text=True
    ).stdout

    if container_id.endswith('\n'):
        container_id = container_id[:-1]

    try:
        yield Container(podman, container_id)
    finally:
        podman('kill', container_id)


@pytest.fixture(scope='session')
def container_session_bus_ready(container):
    container.exec('wait-user-bus.sh')


@pytest.fixture(scope='session')
def container_session_bus_address(container, container_session_bus_ready):
    desc = container.inspect()
    hostport = desc[0]['NetworkSettings']['Ports']['1234/tcp'][0];
    host = hostport['HostIp'] or '127.0.0.1'
    port = hostport['HostPort']

    return f'tcp:host={host},port={port}'


@pytest.fixture(scope='session')
def container_session_bus_connection(container_session_bus_address):
    bus = Gio.DBusConnection.new_for_address_sync(
        container_session_bus_address,
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None,
        None
    )
    try:
        yield bus
    finally:
        bus.close_sync(None)


@pytest.fixture(scope='session')
def gnome_shell_session(container, container_session_bus_ready, pytestconfig):
    session = pytestconfig.option.gnome_session
    container.exec('systemctl', '--user', 'start', f'{session}@:99')
    return session


@pytest.fixture(scope='session')
def enable_extension(container, gnome_shell_session):
    container.exec(
        'wait-dbus-interface.sh', '-d', 'org.gnome.Shell', '-o', '/org/gnome/Shell', '-i', 'org.gnome.Shell.Extensions'
    )

    container.exec('gnome-extensions', 'enable', EXTENSION_UUID)
    return EXTENSION_UUID


def get_extension_dbus_interface(name, container, container_session_bus_connection, enable_extension):
    container.exec(
        'wait-dbus-interface.sh', '-d', 'org.gnome.Shell', '-o', '/org/gnome/Shell/Extensions/ddterm', '-i', name
    )

    return Gio.DBusProxy.new_sync(
        container_session_bus_connection,
        Gio.DBusProxyFlags.NONE,
        None,
        'org.gnome.Shell',
        '/org/gnome/Shell/Extensions/ddterm',
        name,
        None
    )


@pytest.fixture(scope='session')
def extension_dbus_interface(container, container_session_bus_connection, enable_extension):
    return get_extension_dbus_interface(
        'com.github.amezin.ddterm.Extension',
        container,
        container_session_bus_connection,
        enable_extension
    )


@pytest.fixture(scope='session')
def extension_test_dbus_interface(container, container_session_bus_connection, enable_extension):
    return get_extension_dbus_interface(
        'com.github.amezin.ddterm.ExtensionTest',
        container,
        container_session_bus_connection,
        enable_extension
    )
