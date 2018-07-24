'use strict';

/**
 * This module interacts with the DataDog API to retrieve board and monitor information and save
 * it to disk.
 */
var async = require('async'),
  changeCase = require('change-case'),
  fs = require('fs-extra'),
  log4js = require('log4js'),
  path = require('path'),
  request = require('request'),
  safeParse = require('safe-json-parse/tuple'),
  url = require('url'),

  config = require('../config.json'),
  logger = log4js.getLogger('dog-watcher'),

  baseUrl = 'https://app.datadoghq.com/api/v1/',

  /**
   * General purpose request function that builds the proper URL and returns the
   * response body as JSON.
   * @param path The path to be appended to the DataDog base URL.
   * @param data (optional) Data to be sent to the API.  The existence of data changes the call to a
   *        POST.
   * @param callback function(error, dataDogResponse)
   */
  makeDataDogRequest = function(path, data, callback) {
    var dogUrl,
      options;
    dogUrl = url.resolve(baseUrl, path);
    dogUrl += '?api_key=' + config.dataDogApiKey + '&application_key=' + config.dataDogAppKey;
    options = {
      url: dogUrl,
      method: data? 'POST' : 'GET',
      json: data
    };
    request(options, function(error, response, body) {
      var parsedResponse,
        temp;
      if (!error && !body) {
        error = new Error('The DataDog response had no body.');
      }
      if (error) {
        return callback(error);
      }
      if (typeof body === 'object') {
        // No need to parse, just send the response along.
        return callback(null, body);
      }

      parsedResponse = safeParse(body);
      if (parsedResponse[0]) {
        error = new Error('A non-JSON response was returned. ', parsedResponse[0]);
        console.error(error, JSON.stringify(body));

        parsedResponse[0] = error;
      }
      callback(parsedResponse[0], parsedResponse[1]);
    });
  },

  /**
   * Gets a list of all boards of the specified type and stores them as JSON in a type-specific
   * subdirectory under the outputDir provided.
   * @param type String indicating the board type to get - dash (time) or screen.
   * @param outputDir Base directory where the type-specific subdirectory is to be written.
   * @param callback function(error, outputDir).  Output dir is passed to make chaining calls easier.
   */
  getBoards = function (type, outputDir, callback) {
    logger.debug('getBoards(' + type + ')');
    removeFiles(outputDir, type);
    async.waterfall(
      [
        async.apply(makeDataDogRequest, type, null),
        function (boards, next) {
          var listName = type === 'dash'? 'dashes' : 'screenboards';
          async.each(boards[listName],
            function(boardInfo, eachNext) {
              getBoard(boardInfo, type, outputDir, eachNext);
            },
            function(error, results) {
              next(error, results);
            }
          );
        }
      ],
      function(error, result) {
        logger.debug('Done getting ' + type + 'boards.');
        callback(error, outputDir);
      }
    );
  },

  /**
   * Remove all the files in dir1 + dir2
   */
  removeFiles = function(dir1, dir2) {

    var directory = path.resolve(dir1, dir2);

    logger.debug('Remove Files Directory: ' + directory);

    fs.readdir(directory, (err, files) => {
      if (err) throw err;
    
      for (const file of files) {
        fs.unlink(path.join(directory, file), err => {
          if (err) throw err;
        });
        logger.debug('Remove File: ' + file);
      }
    });
  },

  /**
   * Gets the specified board and saves its JSON representation in a type-specific subdirectory
   * under the specified output directory.
   * @param boardInfo Object that includes the board's id and title
   * @param type String indicating if the board is a dash (time) or screen board.
   * @param outputDir Base directory where the type-specific subdirectory is to be written.
   * @param callback function(error).
   */
  getBoard = function(boardInfo, type, outputDir, callback) {
    var targetDir = path.resolve(outputDir, type);
    async.waterfall(
      [
        async.apply(fs.mkdirp, targetDir),
        function(dir, next) {
          makeDataDogRequest(type + '/' + boardInfo.id, null, next);
        },
        function (board, next) {
          fs.writeJson(path.resolve(targetDir,
              boardInfo.id + '-' + changeCase.snake(boardInfo.title || 'untitled') + '.json'),
            board, next);
            logger.debug('Board Title: ' + boardInfo.title);
        }
      ],
      function(error) {
        logger.debug('Got board ' + boardInfo.id + ' - ' + boardInfo.title);
        callback(error);
      }
    );
  },

  /**
   * Gets all monitors and saves them as JSON in a monitors subdirectory under the outputDir provided.
   * @param outputDir Base directory where the monitors subdirectory is to be written.
   * @param callback function(error, outputDir).  Output dir is passed to make chaining calls easier.
   */
  getMonitors = function(outputDir, callback) {
    var targetDir = path.resolve(outputDir, 'monitors');
    async.waterfall(
      [
        async.apply(fs.mkdirp, targetDir),
        function(result, next) {
          makeDataDogRequest('monitor', null, next);
        },
        function (monitors, next) {
          // Remove the current state from the JSON object.  Otherwise it will look like the monitor
          // changed every time its state changes.
          monitors.forEach(function(monitor) {
            delete monitor.overall_state;
          });
          fs.writeJson(path.resolve(targetDir, 'monitors.json'),
            monitors, next);
        }
      ],
      function(error, result) {
        logger.debug('Got monitors');
        callback(error, outputDir);
      }
    );
  },
  /**
   * Sends an event to DataDog indicating that a backup was attempted.  performed
   * @param success Boolean - true if the backup succeeded.
   * @param error Error if there was one.
   * @param callback function(error, dataDogResponse)
   */
  sendDataDogEvent = function(success, error, callback) {
    var alertType = 'info', // the type sent if success is undefined (noop)
      result = 'was attempted', // the result sent if success is undefined (noop)
      event;
    if (success === true) {
      alertType = 'success';
      result = 'succeeded';
    } else if (success === false) {
      alertType = 'error',
      result = 'failed';
    }
    event = {
      title: 'DataDog Dashboard Backup',
      text: 'DataDog dashboard backup ' + result + '.',
      priority: 'normal',
      tags: ['env:datadog'],
      alert_type: alertType
    };

    if (error) {
      event.text += ' ' + error;
    }
    makeDataDogRequest('events', event, callback);
  };

logger.setLevel(process.env.LOG_LEVEL || 'INFO');

module.exports = {
  getBoards: getBoards,
  getMonitors: getMonitors,
  sendDataDogEvent: sendDataDogEvent
};
