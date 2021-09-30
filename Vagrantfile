# -*- mode: ruby -*-
# vi: set ft=ruby :

CPUS = 4
MEMORY = 2048

FEDORA_VERSION = ENV.fetch("FEDORA_VERSION", "34")
FEDORA_BOX_URL_SUBDIR = ""

case FEDORA_VERSION
when "32"
  FEDORA_BOX_VERSION = "1.6"
  FEDORA_BOX_LIBVIRT_SHA256 = "4b13243d39760e59f98078c440d119ccf2699f82128b89daefac02dc99446360"
  FEDORA_BOX_VIRTUALBOX_SHA256 = "87301487ef8214e7c5234979edbebc97c689b42b476e87d9d6c757f43af6eb6f"
when "33"
  FEDORA_BOX_VERSION = "1.2"
  FEDORA_BOX_LIBVIRT_SHA256 = "455767b8ac4d8a4820e186f9674c3b3ef2c5edd65141326b1224dcbc3b9dd1b4"
  FEDORA_BOX_VIRTUALBOX_SHA256 = "dbd5c61e3fe9a37f81b518a3a6d9eede939ec0ea728b731a3e07276429bdf2ea"
when "34"
  FEDORA_BOX_VERSION = "1.2"
  FEDORA_BOX_LIBVIRT_SHA256 = "3d9c00892253c869bffcf2e84ddd308e90d5c7a5928b3bc00e0563a4bec55849"
  FEDORA_BOX_VIRTUALBOX_SHA256 = "e72d9987c61d58108910fab700e8bdf349e69d2e158037a10b07706a68446fda"
when "35_Beta"
  FEDORA_BOX_VERSION = "1.2"
  FEDORA_BOX_LIBVIRT_SHA256 = "4661d497e9a4ce5e2b20979581a4569c754609eb9c44c6437eeb24b5a8d5d0b9"
  FEDORA_BOX_VIRTUALBOX_SHA256 = "d21c34ddc09b1e83647c0fd0f3a387f2fdfd39f6c2746d4d3aae4b11d5e404d5"
  FEDORA_BOX_URL_SUBDIR = "test"
else
  puts "Invalid FEDORA_VERSION=#{FEDORA_VERSION}"
  abort
end

FEDORA_BOX_BASE_URL = "https://download.fedoraproject.org/pub/fedora/linux/releases/#{FEDORA_BOX_URL_SUBDIR}/#{FEDORA_VERSION}/Cloud/x86_64/images"
FEDORA_BOX_LIBVIRT_URL = "#{FEDORA_BOX_BASE_URL}/Fedora-Cloud-Base-Vagrant-#{FEDORA_VERSION}-#{FEDORA_BOX_VERSION}.x86_64.vagrant-libvirt.box"
FEDORA_BOX_VIRTUALBOX_URL = "#{FEDORA_BOX_BASE_URL}/Fedora-Cloud-Base-Vagrant-#{FEDORA_VERSION}-#{FEDORA_BOX_VERSION}.x86_64.vagrant-virtualbox.box"

ENV["LC_ALL"] = "C.UTF-8"

Vagrant.configure("2") do |config|
  config.vm.box = "Fedora-Cloud-Base-Vagrant-#{FEDORA_VERSION}"
  config.vm.box_download_checksum_type = "sha256"

  config.vm.provider "virtualbox" do |virtualbox, override|
    override.vm.box_url = FEDORA_BOX_VIRTUALBOX_URL
    override.vm.box_download_checksum = FEDORA_BOX_VIRTUALBOX_SHA256

    virtualbox.cpus = CPUS
    virtualbox.memory = MEMORY
    virtualbox.gui = true
  end

  config.vm.provider "libvirt" do |libvirt, override|
    override.vm.box_url = FEDORA_BOX_LIBVIRT_URL
    override.vm.box_download_checksum = FEDORA_BOX_LIBVIRT_SHA256

    libvirt.cpus = CPUS
    libvirt.memory = MEMORY
  end
end
