#!/bin/bash

apt install -y git
curl -L git.io/nodebrew | perl - setup
nodebrew install-binary v6.10.2
nodebrew use v6.10.2

git clone https://github.com/NCDCHub/kui-edge-computer.git /home/atmark/KuiEdgeMachine
cd /home/atmark/KuiEdgeMachine
npm install
nmcli connection add type gsm ifname "*" con-name soracom apn soracom.io user sora password sora
nmcli connection add type wifi ifname "*" con-name earthguide ssid earthguide1
cp account.example.js account.js
echo edit account.js
echo and
echo exec \'cp ./check_flashair /etc/cron.d/\'
