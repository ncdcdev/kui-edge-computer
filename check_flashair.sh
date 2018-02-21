#!/bin/bash

LOG_FILE=/var/log/check_flashair.log
FLASHAIR_NAME=earthguide1
NODE=/root/.nodebrew/node/v6.10.2/bin/node
SQLITE_FILE=./index.sqlite3
IMAGE_CACHE=cache
LOCK_FILE=/tmp/check_flashair.lock
MACADDR=`ifconfig usb1 | grep HWaddr | sed -e 's/.*HWaddr //g' -e 's/:/-/g'  -e 's/\s//g'`
#MACADDR='02-80-79-98-18-40'

FILEURL="http://trial.apppot.net/kui-settings/${MACADDR}/"

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
  nmcli connection up ${FLASHAIR_NAME}
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
    disconnect_soracom
    exit_process 1
  fi
  echo connected to soracom-network | log
}

disconnect_flashair(){
  nmcli device disconnect wlan0
  # nmcli connection down ${FLASHAIR_NAME}
  echo disconnected from flashair | log
}

disconnect_soracom(){
  nmcli connection down soracom
  echo disconnected from soracom-network | log
}

update_file(){
  git reset --hard HEAD
  git pull
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
if [ `date +%M` -lt 3 ]; then
  ntpdate ntp.jst.mfeed.ad.jp
fi

update_file

disconnect_soracom

while :
do
  rm -f ${IMAGE_CACHE}/*
  listfile=$(mktemp "/tmp/${0##*/}.tmp.XXXXXX")
  connect_flashair
  sleep 5s
  cat /proc/net/wireless | log
  timeout 60 ${NODE} ./list.js ${SQLITE_FILE} ${FLASHAIR_NAME} ${listfile} 10 >> ${LOG_FILE}
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
    ${NODE} ./recognize_upload.js ${SQLITE_FILE} ${FLASHAIR_NAME} ${file} >> ${LOG_FILE}
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
  disconnect_soracom
done

exit_process 0
