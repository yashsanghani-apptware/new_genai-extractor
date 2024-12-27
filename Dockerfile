FROM node:20

WORKDIR /opt/content-extractor/

COPY package.json /.

RUN apt-get update && \
    apt-get install -y libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libxkbcommon0 libasound2
RUN npm install
RUN npx playwright install

COPY . /.

CMD [ "npm", "start" ]
