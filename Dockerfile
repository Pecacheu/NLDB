FROM node:24-alpine
WORKDIR /nldb/app
COPY app .
RUN npm i
ENTRYPOINT node server