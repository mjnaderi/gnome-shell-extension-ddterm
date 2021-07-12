import io
import logging
import shlex
import subprocess
import tarfile

import pytest
import wand.image


LOGGER = logging.getLogger(__name__)


@pytest.fixture(autouse=True, scope='session')
def prepare(extension_test_dbus_interface):
    extension_test_dbus_interface.Prepare()


def trace_signal(*args):
    logging.info('%s', args)


@pytest.fixture(autouse=True, scope='session')
def trace_signals(extension_test_dbus_interface):
    extension_test_dbus_interface.connect('g-signal', trace_signal)


@pytest.fixture(autouse=True, scope='session')
def screenshot(container, gnome_shell_session):
    try:
        yield
    finally:
        screenshot_tar = container.podman('cp', f'{container.container_id}:/run/Xvfb_screen0', '-', stdout=subprocess.PIPE).stdout
        with tarfile.open(fileobj=io.BytesIO(screenshot_tar)) as tar:
            for tarinfo in tar:
                fileobj = tar.extractfile(tarinfo)
                if not fileobj:
                    continue

                with fileobj:
                    with wand.image.Image(file=fileobj, format='xwd') as img:
                        with img.convert(format='png') as converted:
                            converted.save(filename=f'{tarinfo.name}.png')


@pytest.fixture(autouse=True, scope='session')
def journal(podman_cmd, container, container_session_bus_ready):
    cmd = podman_cmd + container.exec_args + ['journalctl', '--user', '-f']
    cmd_str = shlex.join(cmd)
    logging.info('Starting: %s', cmd_str)
    tail = subprocess.Popen(cmd)
    try:
        yield
    finally:
        tail.terminate()
        tail.wait()
        logging.info('Stopped %s', cmd_str)


def test_show(extension_dbus_interface, extension_test_dbus_interface):
    pass
