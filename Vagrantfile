# -*- mode: ruby -*-
# vi: set ft=ruby :

CPUS = 4
MEMORY = 2048

def fedora_vm(config, fedora_version:, box_version:, virtualbox_sha256:, libvirt_sha256:, primary: false, test: false)
  if test
    box_base_url = "https://download.fedoraproject.org/pub/fedora/linux/releases/test/#{fedora_version}/Cloud/x86_64/images"
  else
    box_base_url = "https://download.fedoraproject.org/pub/fedora/linux/releases/#{fedora_version}/Cloud/x86_64/images"
  end

  config.vm.define "f#{fedora_version}", primary: primary, autostart: primary do |version_specific|
    version_specific.vm.box = "Fedora-Cloud-Base-Vagrant-#{fedora_version}"
    version_specific.vm.box_download_checksum_type = 'sha256'

    version_specific.vm.provider 'virtualbox' do |virtualbox, override|
      override.vm.box_url = "#{box_base_url}/Fedora-Cloud-Base-Vagrant-#{fedora_version}-#{box_version}.x86_64.vagrant-virtualbox.box"
      override.vm.box_download_checksum = virtualbox_sha256
    end

    version_specific.vm.provider 'libvirt' do |libvirt, override|
      override.vm.box_url = "#{box_base_url}/Fedora-Cloud-Base-Vagrant-#{fedora_version}-#{box_version}.x86_64.vagrant-libvirt.box"
      override.vm.box_download_checksum = libvirt_sha256
    end
  end
end

def copy_env(libvirt, name)
  if ENV.key?(name)
    libvirt.qemuenv name => ENV[name]
  end
end

Vagrant.configure("2") do |config|
  config.vm.provider 'virtualbox' do |virtualbox, override|
    virtualbox.cpus = CPUS
    virtualbox.memory = MEMORY
    virtualbox.gui = true
    virtualbox.default_nic_type = 'virtio'
    virtualbox.customize ['modifyvm', :id, '--accelerate3d', 'on', '--vram', '128', '--graphicscontroller', 'vmsvga']
  end

  config.vm.provider 'libvirt' do |libvirt, override|
    libvirt.cpus = CPUS
    libvirt.memory = MEMORY

    if Vagrant.has_plugin?('vagrant-libvirt', '> 0.5.3')
      libvirt.channel :type => 'unix', :target_name => 'org.qemu.guest_agent.0', :target_type => 'virtio'
      libvirt.qemu_use_agent = true
    end

    libvirt.qemu_use_session = true

    libvirt.graphics_type = 'sdl'

    copy_env(libvirt, 'DISPLAY')
    copy_env(libvirt, 'XAUTHORITY')
    copy_env(libvirt, 'WAYLAND_DISPLAY')
    copy_env(libvirt, 'SDL_VIDEODRIVER')
    copy_env(libvirt, 'XDG_CURRENT_DESKTOP')
    copy_env(libvirt, 'XDG_SESSION_DESKTOP')
    copy_env(libvirt, 'XDG_SESSION_TYPE')
    copy_env(libvirt, 'XDG_SESSION_CLASS')
    copy_env(libvirt, 'XDG_RUNTIME_DIR')
    copy_env(libvirt, 'XDG_DATA_DIRS')

    # https://github.com/vagrant-libvirt/vagrant-libvirt/pull/1386
    if Vagrant.has_plugin?('vagrant-libvirt', '> 0.6.3')
      libvirt.video_accel3d = true
      libvirt.video_type = 'virtio'
    else
      libvirt.qemuargs :value => '-display'
      libvirt.qemuargs :value => 'sdl,gl=on'

      libvirt.video_type = 'none'
      libvirt.qemuargs :value => '-device'
      libvirt.qemuargs :value => 'virtio-vga-gl' # virtio-vga-gl,id=video0,max_outputs=1,bus=pci.0,addr=0x2
    end
  end

  fedora_vm(
    config,
    fedora_version: '32',
    box_version: '1.6',
    virtualbox_sha256: '87301487ef8214e7c5234979edbebc97c689b42b476e87d9d6c757f43af6eb6f',
    libvirt_sha256: '4b13243d39760e59f98078c440d119ccf2699f82128b89daefac02dc99446360'
  )

  fedora_vm(
    config,
    fedora_version: '33',
    box_version: '1.2',
    virtualbox_sha256: 'dbd5c61e3fe9a37f81b518a3a6d9eede939ec0ea728b731a3e07276429bdf2ea',
    libvirt_sha256: '455767b8ac4d8a4820e186f9674c3b3ef2c5edd65141326b1224dcbc3b9dd1b4'
  )

  fedora_vm(
    config,
    fedora_version: '34',
    box_version: '1.2',
    virtualbox_sha256: 'e72d9987c61d58108910fab700e8bdf349e69d2e158037a10b07706a68446fda',
    libvirt_sha256: '3d9c00892253c869bffcf2e84ddd308e90d5c7a5928b3bc00e0563a4bec55849'
  )

  fedora_vm(
    config,
    fedora_version: '35',
    box_version: '1.2',
    virtualbox_sha256: '9ff81a28bcf8d66620907b238dc76af5dc594accb02347a759c632f6b0ba30cd',
    libvirt_sha256: '239cbcd6143396e382ed4eafebf5ab870c80042c44a6a7cdb5d041f8fe35b1db',
    primary: true
  )

  fedora_vm(
    config,
    fedora_version: '36_Beta',
    box_version: '1.4',
    virtualbox_sha256: '257d50866c67ebfad305749684ba485bce146e1561e4a338d89f4c92e8dbf229',
    libvirt_sha256: '29f480eeac11b3ac03cdd1b03d509a0b94e883f109beeef61032d987b00a32e3',
    test: true
  )

  config.vm.provision 'prepare', type: 'ansible' do |ansible|
    ansible.playbook = 'ansible/prepare.yml'
    ansible.groups = {
      'all:vars' => { 'ansible_python_interpreter' => '/usr/bin/python3' }
    }
  end

  config.vm.provision 'deploy', type: 'ansible', run: 'always' do |ansible|
    ansible.playbook = 'ansible/deploy.yml'
    ansible.groups = {
      'all:vars' => { 'ansible_python_interpreter' => '/usr/bin/python3' }
    }
  end
end
