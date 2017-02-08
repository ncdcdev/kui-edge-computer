#!/bin/bash

LOG_FILE=/var/log/check_flashair.log
FLASHAIR_NAME=earthguide1
NODE=/opt/node-v6.9.4-linux-armv7l/bin/node
SQLITE_FILE=./index.sqlite3
IMAGE_CACHE=cache
LOCK_FILE=/tmp/check_flashair.lock

log(){
  msg=`cat -`
  echo `date -Ins` ${msg} | tee -a ${LOG_FILE}
}

exit_process(){
  rm -f ${LOCK_FILE}
  exit $1;
}

connect_flashair(){
  ifconfig wlan0 down
  iwconfig wlan0 essid ${FLASHAIR_NAME}
  ifconfig wlan0 up

  for i in {1..40}
  do
    ip addr show wlan0 | grep 'inet 192' > /dev/null && break
    echo -n .
    sleep 1
  done

  if [ $i = 30 ];
  then
    echo "[Failed] failed to connect flashair" | log
    disconnect_flashair
    exit_process 1
  fi
  echo connected to flashair | log
}

connect_soracom(){
  systemctl start soracom-connect

  for i in {1..30}
  do
    ip addr show ppp0 2>&1 | grep 'inet 10' > /dev/null && break
    echo -n .
    sleep 1
  done

  if [ $i = 30 ];
  then
    echo "[Failed] failed to connect soracom-network" | log
    disconnect_soracom
    exit_process 1
  fi
  echo connected to soracom-network | log
}

disconnect_flashair(){
  ifconfig wlan0 down
  echo disconnected from flashair | log
}

disconnect_soracom(){
  systemctl stop soracom-connect
  echo disconnected from soracom-network | log
}

cd `dirname $0`

if [ -e ${LOCK_FILE} ];
then
  echo locking: ${LOCK_FILE} | log
  exit 0
fi

touch ${LOCK_FILE}

disconnect_flashair
disconnect_soracom

# connect_soracom
# ntpdate ntp.jst.mfeed.ad.jp
# disconnect_soracom

while :
do
  rm -f ${IMAGE_CACHE}/*
  listfile=$(mktemp "/tmp/${0##*/}.tmp.XXXXXX")
  connect_flashair
  sleep 5s
  ${NODE} ./list.js ${SQLITE_FILE} ${FLASHAIR_NAME} ${listfile} 10 >> ${LOG_FILE}
  result=$?
  listedfilecount=`cat ${listfile} | wc -l`
  if [ $result = 1 ];
  then
    echo done | log
    rm ${listfile}
    disconnect_flashair
    exit_process 0
  elif [ $result != 0 ];
  then
    echo "[Failed] failed to list files" | log
    rm ${listfile}
    disconnect_flashair
    exit_process 1
  fi

  echo start download files | log
  wget --no-host-directories --directory-prefix=${IMAGE_CACHE} --input-file=${listfile} --append-output=${LOG_FILE}
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

