'use strict';

const redis = require('redis');
const util = require('silence-js-util');
const REMEMBER_PROP = '____$$$$REMEMBER$$$$____';

class RedisSessionStore {
  constructor(config) {
    this.logger = config.logger;
    this.SessionUserFreeList = new util.FreeList(config.UserClass);
    this.tokenType = config.type === 'token' ? true : false;
    this.expireTime = config.expireTime || 30 * 60;
    this.rememberTime = config.rememberTime || 14 * 24 * 60 * 60;
    this.sessionKey = config.sessionKey || 'SILENCE_SESSION';
    this.port = config.port || 6379;
    this.host = config.host || '127.0.0.1';
    this.redisClient = null;
  }
  init() {
    return new Promise((resolve, reject) => {
      this.redisClient = redis.createClient(this.port, this.host);
      this.redisClient.on('error', err => {
        this.logger.error('REDIS ERROR:');
        this.logger.error(err);
      });
      this.redisClient.on('ready', () => {
        resolve();
      });
    });
  }
  close() {
    this.redisClient.end();
  }
  createUser() {
    return this.SessionUserFreeList.alloc();
  }
  freeUser(user) {
    this.SessionUserFreeList.free(user);
  }
  touch(ctx) {
    return new Promise((resolve, reject) => {
      let sid = this.tokenType ? ctx.query[this.sessionKey] : ctx.cookie.get(this.sessionKey);
      if (!sid) {
        return resolve();
      }
      this.redisClient.get(sid, (err, result) => {
        if (err) {
          return reject(err);
        }
        if (!result) {
          return resolve();
        }
        let data;
        try {
          data = JSON.parse(result);
        } catch(e) {
          return reject(e);
        }
        this.logger.debug(`get redis session of '${sid}': ${result}`);
        this.redisClient.expire(sid, data[REMEMBER_PROP] ? this.rememberTime : this.expireTime, err => {
          if (err) {
            return reject(err);
          }
          if (ctx._user === null) {
            ctx._user = this.createUser();
          }
          ctx._user.sessionId = sid;
          data && ctx._user.assign(data);
          ctx._user.isLogin = true;
          resolve();
        });
      });
    });
  }
  login(ctx, remember) {
    return new Promise((resolve, reject) => {
      if (ctx._user === null) {
        return resolve(false);
      }
      if (remember) {
        ctx._user.attrs[REMEMBER_PROP] = true;
      }
      this.redisClient.setex([
        ctx._user.sessionId,
        remember ? this.rememberTime : this.expireTime,
        JSON.stringify(ctx._user.attrs)
      ], err => {
        if (err) {
          return reject(err);
        }
        if (!this.tokenType) {
          ctx.cookie.set(this.sessionKey, ctx._user.sessionId, {
            expires: new Date(Date.now() + (remember ? this.rememberTime : this.expireTime) * 1000)
          });
        }
        ctx._user.isLogin = true;
        resolve(true);
      });
    });
  }
  logout(ctx) {
    return new Promise((resolve, reject) => {
      if (!ctx._user) {
        return resolve(false);
      }
      if (!this.tokenType) {
        ctx.cookie.set(this.sessionKey, '');
      }
      this.redisClient.del(ctx._user.sessionId, err => {
        if (err) {
          reject(err);
        } else {
          ctx._user.isLogin = false;
          resolve(true);
        }
      });
    });
  }
}

module.exports = RedisSessionStore;
