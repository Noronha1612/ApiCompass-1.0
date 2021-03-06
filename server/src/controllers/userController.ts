import { Request, Response } from 'express';
import crypto from 'crypto';

import knex from '../database/connection';

import generateToken from '../utils/generateJWT';

import sendMail from '../services/sendMail';

import { config } from 'dotenv';
config();

class userController {
  async create(request: Request, response: Response) {
    try {
      const {
        name,
        email,
        password,
        confirmPassword,
        country
      } = request.body as {
        name: string,
        email: string,
        password: string,
        confirmPassword: string,
        country: string
      };

      const responseData = await knex('users').select(['email', 'name']);

      const DBEmails = responseData.map( item => item.email);
      const DBNames = responseData.map( item => item.name);

      if ( DBEmails.includes(email) ) {
        return response.json({ logged: false, message: "E-Mail has already been registered", field: 'email' });
      }

      if ( DBNames.includes(name) ) {
        return response.json({ logged: false, message: "Name has already been registered", field: 'name' });
      }

      if ( password !== confirmPassword ) {
        return response.json({ logged: false, message: "The passwords don't match", field: 'password' });
      }

      if ( password.length < 6 ) {
        return response.json({ logged: false, message: "The password is to short", field: 'password' });
      }

      const passKey = process.env["PASS_ENCRYPT_KEY"];
  
      if ( passKey === undefined ) return;
  
      const cipher = crypto.createCipher('aes-256-gcm', passKey);
      
      const encryptedPass = cipher.update(password, 'utf8', 'hex');

      const userId = crypto.randomBytes(4).toString('hex');

      const data = {
        id: userId,
        name,
        email,
        password: encryptedPass,
        country,
        api_ids: '',
        liked_apis: '',
        followers: '',
        following: '',
        score: 0
      }

      await knex('users').insert(data);

      const token = generateToken({
        id: data.id,
        name: data.name,
        email: data.email,
        api_ids: data.api_ids,
        liked_apis: data.liked_apis,
        followers: data.followers,
        following: data.following,
        score: data.score,
        logged: true
      });

      return response.json({ logged: true, jwToken: token });
    } catch (err) {
      console.log (err)
      return response.json({ message: 'Error while trying create user, probably the user typed something unacceptable' })
    }
  }

  async login(request: Request, response: Response) {
    const { email, password } = request.body;

    const passKey = process.env["PASS_ENCRYPT_KEY"];

    if ( passKey === undefined ) return;

    const cipher = crypto.createCipher('aes-256-gcm', passKey);
      
    const encryptedPass = cipher.update(password, 'utf8', 'hex');

    const userData = await knex('users').select(['id', 'password', 'email', 'name', 'api_ids', 'liked_apis', 'followers', 'following', 'score']).where({ email }).first();

    if ( !userData ) {
      return response.json({ logged: false, message: 'Email not found. Please register' });
    }
    if ( encryptedPass !== userData.password ) {
      return response.json({ logged: false, message: "The password does not match" });
    }

    const token = generateToken({
      id: userData.id,
      name: userData.name,
      email: userData.email,
      api_ids: userData.api_ids,
      liked_apis: userData.liked_apis,
      followers: userData.followers,
      following: userData.following,
      score: userData.score,
      logged: true,
    });
    
    return response.json({ logged: true, jwToken: token });
  }

  async sendMail(request: Request, response: Response) {
    const { userEmail } = request.query;

    if ( !userEmail || typeof userEmail === 'object' ) {
      return;
    }

    const authCode = [];

    for ( let x = 1; x <= 6; x++ ) {
        const randomNumber = Math.floor(Math.random() * 10);

        if (randomNumber === 10) {
            authCode.push(9)
            continue;
        }

        authCode.push(randomNumber);
    }
    
    sendMail({ userEmail, authCode });

    const passKey = process.env['PASS_ENCRYPT_KEY'];

    if ( passKey === undefined ) {
      return response.send('passKey undefined') ;
    }

    const cipher = crypto.createCipher('aes-256-gcm', passKey);

    const encryptedAuthCode = cipher.update(authCode.join(''), 'utf8', 'hex');
    
    const jwToken = generateToken({ userEmail, exp: Date.now() + 3600000, authCode: encryptedAuthCode});

    return response.json({ jwToken });
  }

  async index(request: Request, response: Response) {
    const data = request.query.user_id ?
      request.query.user_id : 
      request.query.email;

    const items = ['id', 'name', 'email', 'country', 'api_ids', 'liked_apis', 'followers', 'following', 'score'];

    let users;

    if ( String(data).includes('@') ) {

      try {
        users = data ? 
          await knex('users').select(items).where({ email: data }).first() :
          await knex('users').select(items);

        if ( !users ) {
          return response.json({ error: true, message: 'Email not found' });
        }
      }
      catch (err) {
        console.log(err)

        return response.json({ error: true, message: 'Error while trying search email' });
      }
      
    }
    else {
      try {
        users = data ? 
          await knex('users').select(items).where({ id: data }).first() :
          await knex('users').select(items);

        if ( !users ) {
          return response.json({ error: true, message: 'ID not found' });
        }
      }
      catch (err) {
        return response.json({ error: true, message: 'Error while trying search ID' });
      }
    }
      

    return response.json({error: false, data: users});
  }

  async getName(request: Request, response: Response) {
    const { user_id } = request.params;

    const dbresponse = await knex('users').select('name').where({ id: user_id }).first();

    // expected { name: 'name' }
    return response.json(dbresponse);
  }

  async deleteUser(request: Request, response: Response) {
    try {
      const { user_id } = request.params;

      const foundOne = await knex('users').select('id').where({ id: user_id }).first();

      if ( foundOne === undefined ) return response.json({ deleted: false, error: 'User not found' });

      await knex('users').delete('*').where({ id: user_id });

      return response.json({ deleted: true, user_id });
    }
    catch (err) {
      console.log(err)
      return response.json({ deleted: false, error: 'Something went wrong' });
    }
  }

  async changePassword(request: Request, response: Response) {
    const { user_email } = request.headers as { user_email: string };

    const { newPassword, confNewPassword } = request.body as { newPassword: string, confNewPassword: string };

    const { password: previewPassword } = await knex('users').select('password').where({ email: user_email }).first() as { password: string };

    if ( newPassword !== confNewPassword ) {
      return response.status(400).json({ logged: false, error: false, message: "The passwords don't match", statusCode: 400 });
    }

    if ( newPassword.length < 6 ) {
      return response.status(400).json({ logged: false, error: false, message: "The password is too short", statusCode: 400 });
    }

    const passEncryptKey = process.env.PASS_ENCRYPT_KEY;

    if ( passEncryptKey === undefined ) {
      return response.status(500).json({ logged: false, error: true, message: 'Pass Encrypt Key is undefined', statusCode: 500 });
    }

    const cipher = crypto.createCipher('aes-256-gcm', passEncryptKey);

    const encryptedPass = cipher.update(newPassword, 'utf8', 'hex');

    if ( previewPassword === encryptedPass ) {
      return response.status(400).json({ logged: false, error: false, message: "The password is equal to the previous one", statusCode: 400 });
    }

    await knex('users').update({
      password: encryptedPass
    }).where({ email: user_email });

    return response.status(200).json({ logged: true, error: false, user_email, statusCode: 200 });
  }

  async follow(request: Request, response: Response) {
    const { followed_id, user_id } = request.headers;

    const trx = await knex.transaction();

    const followedData = await trx('users')
      .select(['followers'])
      .where({ id: followed_id })
      .first<{ followers: string | undefined }>();

    if ( typeof followedData.followers !== 'string' ) {
      await trx.rollback()

      return response.status(404).json({ message: 'Followed user not found' });
    }

    const userData = await trx('users')
      .select(['following'])
      .where({ id: user_id })
      .first<{ following: string | undefined }>();

    if ( typeof userData.following !== 'string' ) {
      await trx.rollback()

      return response.status(401).json({ message: 'User not found' });
    }

    const alreadyFollowing = followedData.followers.split(',');

    if ( alreadyFollowing.includes(String(user_id)) ) {
      await trx.rollback()

      return response.status(403).json({ message: 'User has already been following' });
    }

    const newFollowers = alreadyFollowing.join(',') === '' ? user_id : `${alreadyFollowing},${user_id}`;

    const newFollowing = userData.following === ''? followed_id : `${userData.following},${followed_id}`;

    await trx('users')
      .update({ followers: newFollowers })
      .where({ id: followed_id });

    await trx('users')
      .update({ following: newFollowing })
      .where({ id: user_id });

    await trx.commit();

    return response.status(200).json({ followed_id, user_id });
  }

  async unfollow(request: Request, response: Response) {
    const { followed_id, user_id } = request.headers;

    const trx = await knex.transaction();

    const followedData = await trx('users')
      .select(['followers'])
      .where({ id: followed_id })
      .first<{ followers: string | undefined }>();

    if ( typeof followedData.followers !== 'string' ) {
      await trx.rollback()

      return response.status(404).json({ message: 'Followed user not found' });
    }

    const userData = await trx('users')
      .select(['following'])
      .where({ id: user_id })
      .first<{ following: string | undefined }>();

    if ( typeof userData.following !== 'string' ) {
      await trx.rollback()

      return response.status(401).json({ message: 'User not found' });
    }

    const alreadyFollowing = followedData.followers.split(',');

    if ( !alreadyFollowing.includes(String(user_id)) ) {
      await trx.rollback()

      return response.status(403).json({ message: 'User does not follow the followed' });
    }

    const newFollowers = alreadyFollowing
      .filter(following => following !== user_id)
      .join(',');

    const newFollowing = userData.following
      .split(',')
      .filter(followed => followed !== followed_id)
      .join(',');

    await trx('users')
      .update({ followers: newFollowers })
      .where({ id: followed_id });

    await trx('users')
      .update({ following: newFollowing })
      .where({ id: user_id });

    await trx.commit();

    return response.status(200).json({ followed_id, user_id });
  }
}

export default userController;