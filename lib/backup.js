'use strict';
/**
 * The backup coordinator.  This module strings together all of the necessary actions to do a full
 * backup.
 */
var async = require('async'),
  fs = require('fs-extra'),
  temp = require('temp'),
  log4js = require('log4js'),

  config = require('../config.json'),
  dataDog = require('./dataDog.js'),
  git = require('./git.js'),
  logger = log4js.getLogger('dog-watcher'),

  workDir,

  /**
   * Get all boards and monitors from DataDog and check them into Git if necessary.
   */
  performBackup = function(callback) {
    async.waterfall(
      [
        async.apply(temp.mkdir, 'dog-watcher-work'),
        function(dir, next) {
          workDir = dir;
          git.runCommand(['clone', config.gitRepoForBackups, workDir], workDir, next);
        },
        async.apply(git.runCommand, ['checkout', config.gitBranch]),
        async.apply(dataDog.getBoards, 'dash'),
        async.apply(dataDog.getBoards, 'screen'),
        async.apply(dataDog.getMonitors),

        async.apply(git.runCommand, ['add', '--all', '.']),
        async.apply(git.runCommand, ['commit', '-m', 'Automatically committed by dog-watcher script']),
        async.apply(git.runCommand, ['push', 'origin', config.gitBranch])
      ],
      function(error) {
        var success,
          eventErrorMessage;
        if (error && error.message ===  git.GIT_NOOP_MESSAGE) {
          logger.info('There was nothing new to commit.');
          if (config.sendEventOnNoop !== 'true') {
            logger.info('No DataDog event was sent.');
            return callback();
          }
          eventErrorMessage = error.message;
          // not a real error.  Get rid of it.
          error = undefined;

        } else if (error) {
          logger.error('There was an error during the backup attempt.', error);
          success = false;
          eventErrorMessage = error.message;

        } else {
          success = true;
        }
        dataDog.sendDataDogEvent(success, eventErrorMessage, function() {
          logger.debug('Event sent.');
          callback(error);
        })
      });
  },

  /**
   * Perform the backup and clean up the work dir on completion.  At the end if there was a
   * successful backup or a failure an event will be sent to DataDog.
   */
  run = function(callback) {
    performBackup(function(error) {
      fs.remove(workDir, function(removeError) {
        if (removeError) {
          console.error('There was an error removing the work dir.', removeError);
        }
        callback(error);
      });
    });
  };

logger.setLevel(process.env.LOG_LEVEL || 'INFO');

module.exports = run;
