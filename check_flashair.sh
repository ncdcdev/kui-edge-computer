#!/bin/bash

LOG_FILE=/var/log/check_flashair.log
FLASHAIR_NAME=earthguide2
NODE=/root/.nodebrew/node/v6.10.2/bin/node
SQLITE_FILE=./index.sqlite3
IMAGE_CACHE=cache
LOCK_FILE=/tmp/check_flashair.lock
MACADDR=`ifconfig usb1 | grep HWaddr | sed -e 's/.*HWaddr //g' -e 's/:/-/g'  -e 's/\s//g'`
#MACADDR='02-80-79-98-18-40'
FLAGFILEDIR=/var/run/KuiEdgeMachine

FILEURL="http://trial.apppot.net/kui-settings/${MACADDR}/"

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
  # nmcli connection down ${FLASHAIR_NAME}
  echo disconnected from flashair | log
}

disconnect_soracom(){
  nmcli connection down soracom
  echo disconnected from soracom-network | log
}

update_file(){
  FILE=$1
  UHEADER="`curl --location --silent --head ${FILEURL}${FILE}`"
  echo ${UHEADER} | grep '200 OK'
  RESULT=$?
  if [ ${RESULT} = 0 ];then
    echo Update | log
    curl --location --silent "${FILEURL}${FILE}" > /tmp/${FILE}
    curl --location --silent "${FILEURL}${FILE}.md5" > /tmp/${FILE}.md5
    MD5SUM=`md5sum /tmp/${FILE}`
    cd /tmp/
    if md5sum -c ./${FILE}.md5; then
      cd ${CDIR}
      mv /tmp/${FILE} ./${FILE}
      mv /tmp/${FILE}.md5 ./${FILE}.md5
      chmod 744 ./${FILE}
      chown atmark:atmark ./${FILE}
      rm /tmp/${FILE}.md5
      # reboot
    else
      echo 'md5sum not match' | log
    fi
  else
    echo Not Update | log
  fi
}

syncdate(){
  sleep 10
  ntpdate ntp.dnsbalance.ring.gr.jp
  ntpdate ntp.nict.jp
  ntpdate ntp.jst.mfeed.ad.jp
  ntpdate 130.34.48.32 # ntp2.tohoku.ac.jp
  ntpdate 130.87.32.71 # gps.kek.jp
  ntpdate 130.69.251.23 # ntp.nc.u-tokyo.ac.jp
  ntpdate 133.15.64.8 # ntp.tut.ac.jp
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

update_file check_flashair.sh

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
  echo "done image loop" | log
  disconnect_soracom
exit_process 1
done

exit_process 0

