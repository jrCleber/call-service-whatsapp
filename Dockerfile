FROM node:16.10.0-alpine

RUN apt-get update

RUN npm i g yarn

WORKDIR /Projects/callcenter

COPY ./package.json ./
RUN yarn install

COPY . .
RUN yarn build

CMD ["yarn", "start"]