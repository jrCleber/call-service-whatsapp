## call-service-whatsapp

[![Telegram](https://img.shields.io/badge/Group-Telegram-%2333C1FF)](https://t.me/codechatBR)
[![Whatsapp](https://img.shields.io/badge/WhatsApp-message-%2322BC18)](https://api.whatsapp.com/send?phone=5531995918699)
![GitHub](https://img.shields.io/github/license/jrCleber/call-service-whatsapp)
![npm](https://img.shields.io/badge/npm-8.5.5-lightgrey)
[![node](https://img.shields.io/badge/node-^16.10.0-%3C873A)](https://nodejs.org/)
[![nvm](https://img.shields.io/badge/nvm-nodejs-%3C873A)](https://github.com/nvm-sh/nvm#installing-and-updating)

# Customer service via whatsapp

<font size='3'>Have a number and several attendants and control all the service through whatsapp.</font></br>
<font size='3'>The main idea came from the need to have several attendants, segmented into sectors, with the possibility of managing the entire service process through whatsapp itself. Without the attendant needing to access any web page or an external application.</font>

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
The application depends on a MySql/MariaDB database.</br>
If you don't have one:
  - navigate to the [Docker folder](https://github.com/jrCleber/call-service-whatsapp/tree/main/Docker):
#### Docker
```sh
$ cd Docker
$ docker-compose up
```
### Prisma

The connection to the database is carried out through the [prism orm](https://www.prisma.io/docs/getting-started/quickstart).

For users who have permission to change the database, run the command:
```sh
$ yarn prisma:migrate
```
This command will migrate the modeling in the [schema](https://github.com/jrCleber/call-service-whatsapp/blob/main/prisma/schema.prisma) to the database.

For users without permission, execute the query in [./prisma/migration.sql](https://github.com/jrCleber/call-service-whatsapp/blob/main/prisma/migration.sql), directly in the database.</br>
At the end of the query, run the command:
```sh
$ yarn prisma:generate
```
The generate command generates assets for the Prisma Client based on the data model defined in the [./prism/schema.prisma](https://github.com/jrCleber/call-service-whatsapp/blob/main/prisma/schema.prism) file.

### Creating the center and sectors
To insert the agents in the database, we first need to create the call center and sectors. See the example at [./prisma/create.ts](https://github.com/jrCleber/call-service-whatsapp/blob/main/prisma/create.ts).</br>

We are now ready to launch the application in development mode.
```sh
$ yarn start:dev
```
<font size='3'>Build</font>

```sh
$ yarn build

$ yarn start
```
## Commands
There are already ready commands, which you can insert directly into the chat during a call or outside a call, they are:</br>
  - &end: ends the transaction;</br>
    ├> sends a message to the client informing the termination of its protocol;</br>
    ├> releases the user for a new service;</br>
    └> sends a message to the attendant informing the termination.</br>
  - &list: lists all transactions linked to the user and sends them to the attendant in</br>
    │      xlsx format.</br>
    └> &list c=id: lists all transactions for a given user.</br>
  - &customer: lists all clients and sends this information in xlsx format.</br>
    ├> &customer c=\[id\]: retrieves all information for a specific customer;</br>
    └> &customer g=\[id\]: retriever a customer and start a call.</br>
  - &transfer s=\[sector name\]: transfers the customer to the specified sector that</br>
    had attendants.</br>
  - &pause: not implemented:</br>
    └> puts a given call on hold.</br>
  - &status: not implemented:</br>
    └> informs the status of a given service.
</br>

Commands can be created and edited at [commands.ts](https://github.com/jrCleber/call-service-whatsapp/blob/main/src/instance/command/commands.ts).

<hr>

# Note
This code is in no way affiliated with WhatsApp. Use at your own discretion. Don't spam this.</br>

This code was produced based on the [baileys](https://github.com/adiwajshing/Baileys) library and it is still under development.
