#!/bin/bash

USERNAME="x"
PASSWORD="x"
CARRIER="soracom"
while getopts u:p:c: OPT
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
  esac
done

if [ "${USERNAME}" = "x" -o "${PASSWORD}" = "x" ];
then
  echo "Not enough arguments"
  echo "Please specify username and password"
  echo "Usage: $0 -u USERNAME -p PASSWORD"
  exit 0
fi

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
cat << EOT > account.js
module.exports = {
  username: "${USERNAME}",
  password: "${PASSWORD}"
}
EOT
cp ./check_flashair /etc/cron.d/
poweroff
