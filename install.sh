#!/bin/bash

set -ex
apt update
apt install -y git vim graphicsmagick
curl -L git.io/nodebrew | perl - setup
echo 'export PATH=$HOME/.nodebrew/current/bin:$PATH' >> ~/.bashrc
. ~/.bashrc
nodebrew install-binary v6.10.2
nodebrew use v6.10.2

git clone https://github.com/NCDCHub/kui-edge-computer.git /home/atmark/KuiEdgeMachine
cd /home/atmark/KuiEdgeMachine
npm install
nmcli connection add type gsm ifname "*" con-name wan3g apn mmtcom.jp user 'mmt@mmt' password mmt
nmcli connection add type wifi ifname "*" con-name flashair ssid earthguide1
cp account.example.js account.js
set +ex
MACADDR=`ip addr show wlan0 | grep link/ether | sed -E "s@.*link/ether\s(\S+)(\s.*|$)@\1@g"`
clear
echo add records to Machine Table using \'${MACADDR}\'
echo edit account.js
echo and
echo exec \'cp ./check_flashair /etc/cron.d/\'
