#!/bin/bash

LOG_FILE=/var/log/check_flashair.log
NETWORK_NAME=earthguide
NODE=/root/.nodebrew/node/v6.10.2/bin/node
INDEX_FILE=index.txt
SITE_ID_FILE=siteid.txt
IMAGE_CACHE=cache
LOCK_FILE=/tmp/check_flashair.lock
MACADDR=`ip addr show eth0 | grep link/ether | sed -E "s@.*link/ether\s(\S+)(\s.*|$)@\1@g"`
FLAGFILEDIR=/var/run/KuiEdgeMachine

mkdir -p ${FLAGFILEDIR}

log(){
  msg=`cat -`
  echo `date -Ins` ${msg} | tee -a ${LOG_FILE}
}

exit_process(){
  rm -f ${LOCK_FILE}
  if [ "x${listfile}" != "x" ] && [ -e ${listfile} ];then
    rm ${listfile}
  fi
  exit $1;
}

connect_flashair(){
  nmcli connection up ${NETWORK_NAME}
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
  nmcli connection up soracom
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
  sleep 5
  echo connected to soracom-network | log
}

disconnect_flashair(){
  nmcli device disconnect wlan0
  # nmcli connection down ${NETWORK_NAME}
  echo disconnected from flashair | log
}

disconnect_soracom(){
  nmcli connection down soracom
  echo disconnected from soracom-network | log
}

update_file(){
  git reset --hard HEAD
  git checkout master
  git pull
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
  echo locking: ${LOCK_FILE} | log
  exit 0
fi

touch ${LOCK_FILE}

disconnect_flashair
disconnect_soracom

connect_soracom

if [ `/bin/date +%Y` -lt 2000 ]; then
  ./els31-firewall-disable
  syncdate
fi

if [ `/bin/date +%M` -lt 4 ]; then
  syncdate
fi

update_file
if [ ! -e ${INDEX_FILE} ]; then
  echo 0 > ${INDEX_FILE}
fi
if [ ! -e ${SITE_ID_FILE} ]; then
  echo 0 > ${SITE_ID_FILE}
fi
${NODE} ./update_machine_status.js ${INDEX_FILE} ${MACADDR} ${SITE_ID_FILE} >> ${LOG_FILE}

disconnect_soracom

while :
do
  rm -f ${IMAGE_CACHE}/*
  listfile=$(mktemp "/tmp/${0##*/}.tmp.XXXXXX")
  connect_flashair
  sleep 5s
  cat /proc/net/wireless | log
  timeout 60 ${NODE} ./list.js ${INDEX_FILE} ${listfile} 10 >> ${LOG_FILE}
  result=$?
  listedfilecount=`cat ${listfile} | wc -l`
  echo "list file"
  cat ${listfile}
  if [ $result = 1 ];
  then
    echo done | log
    disconnect_flashair
    exit_process 0
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
    ${NODE} ./recognize_upload.js ${INDEX_FILE} ${file} ${MACADDR} ${SITE_ID_FILE} >> ${LOG_FILE}
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
    fi
  done
  echo "done image loop" | log
  disconnect_soracom
exit_process 1
done

exit_process 0

