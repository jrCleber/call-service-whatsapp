## call-service-whatsapp

[![Telegram](https://img.shields.io/badge/Group-Telegram-%2333C1FF)](https://t.me/codechatBR)
[![Whatsapp](https://img.shields.io/badge/WhatsApp-message-%2322BC18)](https://api.whatsapp.com/send?phone=5531995918699)
![GitHub](https://img.shields.io/github/license/jrCleber/call-service-whatsapp)
[![npm](https://img.shields.io/badge/npm-8.5.5-lightgrey)]
[![node](https://img.shields.io/badge/node-^16.10.0-%3C873A)](https://nodejs.org/)
[![nvm](https://img.shields.io/badge/nvm-nodejs-%3C873A)](https://github.com/nvm-sh/nvm#installing-and-updating)

# Customer service via whatsapp

Have a number and several attendants and control all the service through whatsapp.

## Infrastructure

### Nvm installation

```sh
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
# or
$ wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
```
### Docker installation

```sh
$ curl -fsSL https://get.docker.com -o get-docker.sh

$ sudo sh get-docker.sh

$ sudo usermod -aG docker ${USER}

$ sudo apt-get install docker-compose
```
> After finishing, restart the terminal to load the new information.

### Nodejs installation

```sh
$ nvm install 16.10.0

$ node --version

$ docker --version

$ docker-compose --version
```
## Application startup

Install all dependencies.
```sh
$ yarn install
# or
$ npm i
```
The application depends on a MySql/MariaDB database.
If you don't have one:
  - navigate to the [Docker folder](https://github.com/jrCleber/call-service-whatsapp/tree/main/Docker:
```sh
$ cd Docker
$ docker-compose up
```
