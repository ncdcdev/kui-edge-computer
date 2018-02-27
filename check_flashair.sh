#!/bin/bash

LOG_FILE=/var/log/check_flashair.log
NET_3G_NAME=soracom
NET_WIFI_NAME=earthguide
NODE=/root/.nodebrew/node/v6.10.2/bin/node

STATUS_DIR=status_files/
INDEX_FILE=${STATUS_DIR}index.txt
SITE_ID_FILE=${STATUS_DIR}siteid.txt
SSID_FILE=${STATUS_DIR}ssid.txt
PSWD_FILE=${STATUS_DIR}pswd.txt
GITTAG_FILE=${STATUS_DIR}git-tag.txt

IS_SKIP=0

IMAGE_CACHE=cache
LOCK_FILE=/tmp/check_flashair.lock
MACADDR=`ip addr show wlan0 | grep link/ether | sed -E "s@.*link/ether\s(\S+)(\s.*|$)@\1@g"`
FLAGFILEDIR=/var/run/KuiEdgeMachine

mkdir -p ${FLAGFILEDIR}

log(){
  msg=`cat -`
  echo `date -Ins` ${msg} >> ${LOG_FILE}
}

exit_process(){
  rm -f ${LOCK_FILE}
  if [ "x${listfile}" != "x" ] && [ -e ${listfile} ];then
    rm ${listfile}
  fi
  echo "end script..." | log
  exit $1;
}

connect_flashair(){
  nmcli connection up ${NET_WIFI_NAME}
  nmcli device connect wlan0
  RESULT=$?

  if [ ${RESULT} != 0 ];
  then
    echo "[Failed] failed to connect flashair" | log
    disconnect_flashair
    exit_process 1
  fi
  echo connected to flashair | log
}

connect_soracom(){
  nmcli connection up ${NET_3G_NAME}
  systemctl start connection-recover.service
  RESULT=$?

  if [ ${RESULT} != 0 ];
  then
    echo "[Failed] failed to connect soracom-network" | log
    if [ -e ${FLAGFILEDIR}/sorafail1 ];then
      if [ -e ${FLAGFILEDIR}/sorafail2 ];then
        if [ -e ${FLAGFILEDIR}/sorafail3 ];then
          echo "[Failed] failed to connect soracom-network 4 times rebooting" | log
          rm ${FLAGFILEDIR}/sorafail*
          reboot
        else
          touch ${FLAGFILEDIR}/sorafail3;
        fi
      else
        touch ${FLAGFILEDIR}/sorafail2;
      fi
    else
      touch ${FLAGFILEDIR}/sorafail1;
    fi
    disconnect_soracom
    exit_process 1
  fi
  rm ${FLAGFILEDIR}/sorafail*
  sleep 20
  echo connected to soracom-network | log
}

disconnect_flashair(){
  nmcli device disconnect wlan0
  # nmcli connection down ${NET_WIFI_NAME}
  echo disconnected from flashair | log
}

disconnect_soracom(){
  systemctl stop connection-recover.service
  nmcli connection down ${NET_3G_NAME}
  echo disconnected from soracom-network | log
}

update_file(){
  echo 'updating...' | log
  git reset --hard HEAD
  git fetch --all
  git checkout refs/tags/`cat ${GITTAG_FILE}`
}

syncdate(){
  sleep 10
  ntpdate ntp.dnsbalance.ring.gr.jp
  ntpdate ntp.nict.jp
  ntpdate ntp.jst.mfeed.ad.jp
}

cd `dirname $0`
CDIR=`pwd`

if [ -e ${LOCK_FILE} ];
then
  exit 0
fi

echo "start script..." | log

touch ${LOCK_FILE}

disconnect_flashair
disconnect_soracom

connect_soracom

if [ `/bin/date +%Y` -lt 2000 ]; then
  syncdate
fi

if [ `/bin/date +%M` -lt 4 ]; then
  syncdate
fi

if [ ! -d ${STATUS_DIR} ]; then
  mkdir ${STATUS_DIR}
fi

if [ ! -e ${INDEX_FILE} ]; then
  echo 0 > ${INDEX_FILE}
fi
if [ ! -e ${SITE_ID_FILE} ]; then
  echo 0 > ${SITE_ID_FILE}
fi
if [ ! -e ${SSID_FILE} ]; then
  echo 0 > ${SSID_FILE}
fi
if [ ! -e ${PSWD_FILE} ]; then
  echo 0 > ${PSWD_FILE}
fi
if [ ! -e ${GITTAG_FILE} ]; then
  echo 0 > ${GITTAG_FILE}
fi

while :
do
  timeout 30 ${NODE} ./update_machine_status.js ${INDEX_FILE} "${MACADDR}" ${SITE_ID_FILE} "${SSID_FILE}" "${PSWD_FILE}" "${GITTAG_FILE}" >> ${LOG_FILE}

  result=$?
  if [ $result = 1 ];
  then
    reboot
  elif [ $result = 2 ];
  then
    disconnect_soracom
    exit_process 0
  elif [ $result = 3 ];
  then
    poweroff
  elif [ $result = 4 ];
  then
    NEW_SSID=`cat ${SSID_FILE}`
    NEW_PSWD=`cat ${PSWD_FILE}`
    nmcli connection modify ${NET_WIFI_NAME} 802-11-wireless.ssid ${NEW_SSID}
    nmcli connection modify ${NET_WIFI_NAME} wifi-sec.key-mgmt wpa-psk wifi-sec.psk ${NEW_PSWD}
    break
  elif [ $result = 5 ];
  then
    update_file
    disconnect_soracom
    exit_process 0
  elif [ $result = 6 ];
  then
    IS_SKIP=1
    break
  elif [ $result = 7 ];
  then
    connect_soracom
    continue
  elif [ $result > 100 ];
  then
    connect_soracom
    continue
  fi
done

disconnect_soracom

while :
do
  rm -f ${IMAGE_CACHE}/*
  listfile=$(mktemp "/tmp/${0##*/}.tmp.XXXXXX")
  connect_flashair
  sleep 5s
  cat /proc/net/wireless | log
  timeout 60 ${NODE} ./list.js ${INDEX_FILE} ${listfile} 10 ${IS_SKIP} >> ${LOG_FILE}
  result=$?
  listedfilecount=`cat ${listfile} | wc -l`
  echo "list file"
  cat ${listfile}
  if [ $result = 1 ];
  then
    echo done | log
    disconnect_flashair
    exit_process 0
  elif [ $result = 2 ];
  then
    :
    # skip files
  elif [ $result != 0 ];
  then
    echo "[Failed] failed to list files" | log
    disconnect_flashair
    exit_process 1
  fi
  if [ $listedfilecount = 0 ];
  then
    echo 'file count = 0' | log
    disconnect_flashair
    exit_process 0
  fi

  echo start download files | log
  wget --timeout=10 --no-host-directories --directory-prefix=${IMAGE_CACHE} --input-file=${listfile} --append-output=${LOG_FILE}
  disconnect_flashair
  rm ${listfile}

  downloadedfilecount=`ls ${IMAGE_CACHE} -U1 | wc -l`
  if [ ! $listedfilecount = $downloadedfilecount ];
  then
    echo "[Failed] failed to download files listed $listedfilecount downloaded $downloadedfilecount" | log
    exit_process 2
  fi

  connect_soracom
  for file in ${IMAGE_CACHE}/*;
  do
    ${NODE} ./recognize_upload.js ${INDEX_FILE} ${file} "${MACADDR}" ${SITE_ID_FILE} ${IS_SKIP} >> ${LOG_FILE}
    result=$?
    if [ $result = 0 ];
    then
      echo "[Success] ${file}" | log
    elif [ $result = 1 ];
    then
      echo "[Failed] ${file} failed to recognize kui number" | log
    elif [ $result = 2 ];
    then
      echo "[Failed] ${file} failed to upload data" | log
      disconnect_soracom
      exit_process 4
    elif [ $result = 3 ];
    then
      echo "[Failed] ${file} kuinumber notfound" | log
    elif [ $result = 4 ];
    then
      echo "[Ignore] ${file} recognized but ignore status" | log
    elif [ $result = 5 ];
    then
      echo "[Skipped] until ${file}" | log
    fi

  done
  echo "done image loop" | log
  disconnect_soracom
done

exit_process 0

