FROM ubuntu:latest
ENV TZ=Asia/Shanghai
ARG DEBIAN_FRONTEND=noninteractive


WORKDIR /home/bilibili_blacklist
COPY ./ /home/bilibili_blacklist

RUN	apt-get update && \
	touch entrypoint.sh && \
	echo '#!/bin/bash \n cd /home/bilibili_blacklist;service mongodb start;npm run build && node .' >> entrypoint.sh && \
	cp -f entrypoint.sh /usr/local/bin/entrypoint.sh && \
	chmod 777 /usr/local/bin/entrypoint.sh && \
	apt-get install tzdata npm git mongodb wget -y && \
	service mongodb start && \
	wget https://harrynull.tech/bilibili/fetch_sharelist && \
	mv fetch_sharelist fetch_sharelist.json && \
	npm install && \
	mongoimport --db bilibili_blacklist --collection sharelist --file fetch_sharelist.json --jsonArray 
	
ENTRYPOINT ["entrypoint.sh"]
