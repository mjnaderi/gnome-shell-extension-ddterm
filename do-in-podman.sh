#!/bin/bash

TTY_FLAG=$(test -t 0 && echo -n -t)

set -ex

exec podman run --init --rm -i $TTY_FLAG -v "${PWD}:${PWD}" -w "${PWD}" ghcr.io/amezin/gnome-shell-extension-ddterm-ci-docker-image:master xvfb-run "$@"
