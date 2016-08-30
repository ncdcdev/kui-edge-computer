#!/bin/bash

sudo mkdir /etc/soracom-connect
sudo cp ./connect_air.sh /etc/soracom-connect/
sudo apt-get install -y usb-modeswitch wvdial
sudo cp ./service /etc/systemd/system/soracom-connect.service
