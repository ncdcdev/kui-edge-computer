#!/bin/bash

PROJ_DIR="/home/atmark/KuiEdgeMachine"

USERNAME="x"
PASSWORD="x"
CARRIER="soracom"
NOOFF="x"
FROMNOW="x"
while getopts u:p:c:ob OPT
do
  case $OPT in
    u)
      USERNAME="$OPTARG"
      ;;
    p)
      PASSWORD="$OPTARG"
      ;;
    c)
      CARRIER="$OPTARG"
      ;;
    o)
      NOOFF="1"
      ;;
    b)
      FROMNOW="1"
      ;;
  esac
done

if [ "${FROMNOW}" = "x" -a \( "${USERNAME}" = "x" -o "${PASSWORD}" = "x" \) ];
then
  echo "Not enough arguments"
  echo "Please specify username and password or use -b option"
  echo "Usage: $0 -u USERNAME -p PASSWORD"
  echo "Usage: $0 -b"
  exit 0
fi

if [ "${FROMNOW}" = "1"];
then
  if [ ! -e "${PROJ_DIR}/account.js" ];
  then
    echo "${PROJ_DIR}/account.js is not exists"
    echo "Please specify username and password"
    echo "Usage: $0 -u USERNAME -p PASSWORD"
    exit 1
  fi
fi

set -ex
apt update
apt install -y git vim graphicsmagick
cat ~/.bashrc | grep -v nodebrew > ~/.bashrc.new
mv ~/.bashrc{,.old}
mv ~/.bashrc{.new,}
if [ -d .nodebrew ];
then
  rm -rf .nodebrew
  rm -rf .npm
fi
curl -L git.io/nodebrew | perl - setup
echo 'export PATH=$HOME/.nodebrew/current/bin:$PATH' >> ~/.bashrc
. ~/.bashrc
nodebrew install-binary v6.10.2
nodebrew use v6.10.2

if [ "${FROMNOW}" = "1" ];
then
  mv "${PROJ_DIR}/account.js" ~/account.js
fi
if [ -d ${PROJ_DIR} ];
then
  rm -rf ${PROJ_DIR}
fi
git clone https://github.com/NCDCHub/kui-edge-computer.git ${PROJ_DIR}
cd /home/atmark/KuiEdgeMachine
npm install

GSM_IFACE=$(nmcli connection | grep gsm | cut -d' ' -f 1)
WIFI_IFACE=$(nmcli connection | grep 802-11-wireless | cut -d' ' -f 1)
if [ ! "${GSM_IFACE}" = "" ];
then
  nmcli connection delete ${GSM_IFACE}
fi

if [ ! "${WIFI_IFACE}" = "" ];
then
  nmcli connection delete ${WIFI_IFACE}
fi
case $CARRIER in
  soracom)
    nmcli connection add type gsm ifname "*" con-name wan3g apn soracom.io user sora password sora
    ;;
  marubeni)
    nmcli connection add type gsm ifname "*" con-name wan3g apn mmtcom.jp user 'mmt@mmt' password mmt
    ;;
  *)
    nmcli connection add type gsm ifname "*" con-name wan3g apn soracom.io user sora password sora
    ;;
esac

nmcli connection add type wifi ifname "*" con-name flashair ssid earthguide1

if [ "${FROMNOW}" = "x" ];then
cat << EOT > account.js
module.exports = {
  username: "${USERNAME}",
  password: "${PASSWORD}"
}
EOT
else
  mv ~/account.js "${PROJ_DIR}/account.js"
fi
cp ./check_flashair /etc/cron.d/
if [ "${NOOFF}" = "x" ];
then
  poweroff
fi
