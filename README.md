dog-watcher
==============

This project provides a simple means for capturing your DataDog dashboards and monitors as JSON and
storing them in a git repository.  It will also create a DataDog event on success or failure.  If
run regularly it can help provide a change history (minus authors) for DataDog objects.

To use this project:

1. Create your own config.json file based on config.json.example.
1. Make sure that you have an [SSH key configured to allow git write access](https://help.github.com/articles/generating-ssh-keys/).
1. npm install
1. node index.js

That's all.  Dashboards and monitors will be retrieved and committed to the git repo that you
specified in the config file.

To run this project with [PM2](https://github.com/Unitech/PM2/blob/master/README.md) to ensure it stays up just run:
* npm start

A few other details.
--------------------

#### Scheduling

By default if you run this project you will get a one time backup.  However, if you wish to have
this backup task continue to run on a regular basis then you can specify a valid cron interval value
under backupInterval in your config file.  For example, to run every 10 minutes you would add:
```
  "backupInterval": "*/10 * * * *"
```

The interpretation of the interval will be logged out (debug level only) for you to validate.  In
this case it would look like this:
```
[{"s":[0],"m":[0,10,20,30,40,50]}]
```

#### Environment Variables For Debugging
These env vars can be used.

- DEBUG - if true the temp work directory that is used for cloning and committing to your repo is
left behind.  The default behavior is to delete the directory on exit.
- LOG_LEVEL - Log4js logging level (ERROR, WARN, INFO, DEBUG).  The default is INFO.
