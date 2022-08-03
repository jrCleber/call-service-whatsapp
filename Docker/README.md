# Docker

Create a .ini settings file for the database, and a folder to mirror the volumes.

```sh
# volumes
$ sudo mkdir -p /data/mysql

# configuration folder
$ sudo mkdir -p /data/php/admin

# uploads.in
$ sodo nano /data/php/admin/uploads.ini
```
Copy and paste the settings from the [uploads.ini](https://github.com/jrCleber/call-service-whatsapp/blob/main/Docker/uploads.ini) file and give the command:
 - Ctrl o: to save the file.
 - Ctrl x: to close the file.
 - [↩️](https://github.com/jrCleber/call-service-whatsapp#docker)