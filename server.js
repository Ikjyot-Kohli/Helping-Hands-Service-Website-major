import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'crypto';

import {
  initDB,
  run,
  get,
  all,
  dbPath
} from './db.js';


const app = express();

const PORT =
  process.env.PORT || 3000;


const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  dirname(__filename);

const ROOT =
  __dirname;


// =========================================================
// MIDDLEWARE
// =========================================================

app.use(cors());

app.use(express.json({ limit: '5mb'}));

app.use(
  express.urlencoded({
    extended: true
  })
);


// =========================================================
// STATIC FILES
// =========================================================

app.use(
  '/public',
  express.static(
    join(ROOT, 'public')
  )
);


// =========================================================
// VALIDATION
// =========================================================

const emailRx =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


const nameRx =
  /^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/;


const phoneRx =
  /^[0-9]{10}$/;


const passwordRx =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;


function clean(value) {

  return typeof value === 'string'
    ? value.trim()
    : value;

}


function validName(value) {

  const name =
    clean(value);

  return (
    !!name &&
    name.length >= 2 &&
    name.length <= 80 &&
    nameRx.test(name) &&
    /[A-Z]/.test(name) &&
    /[a-z]/.test(name)
  );

}


function validEmail(value) {

  return emailRx.test(
    clean(value) || ''
  );

}


function validPhone(value) {

  const phone =
    String(value || '')
      .replace(/\D/g, '');

  return phoneRx.test(phone);

}


// =========================================================
// PASSWORD HASHING
// =========================================================

function hashPassword(password) {

  const salt =
    randomBytes(16)
      .toString('hex');

  const hash =
    scryptSync(
      password,
      salt,
      64
    ).toString('hex');

  return `${salt}:${hash}`;

}


function verifyPassword(
  password,
  stored
) {

  try {

    const parts =
      String(stored || '').split(':');

    const salt =
      parts[0];

    const expected =
      parts[1];


    if (!salt || !expected) {
      return false;
    }


    const actual =
      scryptSync(
        password,
        salt,
        64
      ).toString('hex');


    const actualBuffer =
      Buffer.from(
        actual,
        'hex'
      );


    const expectedBuffer =
      Buffer.from(
        expected,
        'hex'
      );


    if (
      actualBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }


    return timingSafeEqual(
      actualBuffer,
      expectedBuffer
    );

  } catch (error) {

    console.error(
      'Password verification error:',
      error
    );

    return false;

  }

}


// =========================================================
// SESSION TOKEN
// =========================================================

async function issueToken(userId) {

  const token =
    randomBytes(32)
      .toString('hex');


  const expires =
    Date.now() +
    7 * 24 * 60 * 60 * 1000;


  await run(
    `
    INSERT INTO sessions
    (
      token,
      user_id,
      expires_at
    )
    VALUES (?, ?, ?)
    `,
    [
      token,
      userId,
      expires
    ]
  );


  return token;

}


// =========================================================
// AUTHENTICATION MIDDLEWARE
// =========================================================

async function auth(
  req,
  res,
  next
) {

  try {

    const header =
      req.get('authorization') || '';


    const token =
      header.startsWith('Bearer ')
        ? header.slice(7).trim()
        : '';


    if (!token) {

      return res.status(401).json({

        error:
          'Authentication required. Please login.'

      });

    }


    const session =
      await get(
        `
        SELECT
          s.token,
          s.expires_at,
          u.*
        FROM sessions s
        JOIN users u
          ON u.id = s.user_id
        WHERE s.token = ?
        `,
        [token]
      );


    if (
      !session ||
      session.expires_at < Date.now()
    ) {

      if (session) {

        await run(
          'DELETE FROM sessions WHERE token=?',
          [token]
        );

      }


      return res.status(401).json({

        error:
          'Session expired. Please login again.'

      });

    }


    req.user =
      session;


    next();

  } catch (error) {

    console.error(
      'Authentication middleware error:',
      error
    );


    return res.status(500).json({

      error:
        'Authentication error.'

    });

  }

}


// =========================================================
// VALIDATION ERROR
// =========================================================

function validationError(
  res,
  fields
) {

  return res.status(400).json({

    error:
      'Please correct the highlighted fields.',

    fields

  });

}


// =========================================================
// WEBSITE PAGES
// =========================================================

const pages = [
  'index.html',
  'login.html',
  'register.html',
  'register2.html',
  'profile.html',
  'tryal.html'
];


for (const page of pages) {

  app.get(
    `/${page}`,
    (req, res) => {

      res.sendFile(
        join(ROOT, page)
      );

    }
  );

}


app.get(
  '/',
  (req, res) => {

    res.sendFile(
      join(ROOT, 'index.html')
    );

  }
);


app.get(
  '/favicon.png',
  (req, res) => {

    res.sendFile(
      join(ROOT, 'favicon.png')
    );

  }
);


app.get(
  '/Share%20and%20Care%20Logo.jpeg',
  (req, res) => {

    res.sendFile(
      join(
        ROOT,
        'Share and Care Logo.jpeg'
      )
    );

  }
);


app.get(
  '/Helping%20Hands%20Logo1.jpeg',
  (req, res) => {

    res.sendFile(
      join(
        ROOT,
        'Helping Hands Logo1.jpeg'
      )
    );

  }
);


// =========================================================
// REGISTER
// =========================================================

app.post(
  '/api/auth/register',
  async (req, res) => {

    try {

      console.log('');
      console.log(
        '========== REGISTER REQUEST =========='
      );


      const name =
        clean(req.body.name);


      const email =
        clean(req.body.email)
          ?.toLowerCase();


      const phone =
        String(
          req.body.phone || ''
        ).replace(/\D/g, '');


      const password =
        String(
          req.body.password || ''
        );


      const confirmPassword =
        String(
          req.body.confirmPassword || ''
        );


      const role =
        [
          'user',
          'volunteer',
          'donor'
        ].includes(req.body.role)
          ? req.body.role
          : 'user';


      const location =
        clean(req.body.location) || '';


      const availability =
        clean(
          req.body.availability
        ) || 'Flexible';


      console.log(
        'Name:',
        name
      );

      console.log(
        'Email:',
        email
      );

      console.log(
        'Phone:',
        phone
      );


      // -----------------------------
      // VALIDATION
      // -----------------------------

      const fields = {};


      if (!validName(name)) {

        fields.name =
          'Use first and last name with normal uppercase and lowercase letters.';

      }


      if (!validEmail(email)) {

        fields.email =
          'Enter a valid email address.';

      }


      if (!validPhone(phone)) {

        fields.phone =
          'Phone number must contain exactly 10 digits.';

      }


      if (!passwordRx.test(password)) {

        fields.password =
          'Password must be at least 8 characters and include a letter, number and special character.';

      }


      if (
        password !==
        confirmPassword
      ) {

        fields.confirmPassword =
          'Passwords do not match.';

      }


      if (
        Object.keys(fields).length
      ) {

        console.log(
          '❌ Registration validation failed:',
          fields
        );


        return validationError(
          res,
          fields
        );

      }


      // -----------------------------
      // CHECK EXISTING EMAIL
      // -----------------------------

      const existingUser =
        await get(
          `
          SELECT id
          FROM users
          WHERE email = ?
          COLLATE NOCASE
          LIMIT 1
          `,
          [email]
        );


      if (existingUser) {

        return res.status(409).json({

          error:
            'An account with this email already exists.'

        });

      }


      // -----------------------------
      // CREATE USER
      // -----------------------------

      const passwordHash =
        hashPassword(password);


      const result =
        await run(
          `
          INSERT INTO users
          (
            name,
            email,
            phone,
            password_hash,
            role,
            location,
            availability
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            name,
            email,
            phone,
            passwordHash,
            role,
            location,
            availability
          ]
        );


      console.log(
        '✅ USER SAVED'
      );

      console.log(
        'User ID:',
        result.id
      );


      // -----------------------------
      // CREATE SESSION
      // -----------------------------

      const token =
        await issueToken(
          result.id
        );


      // -----------------------------
      // GET USER
      // -----------------------------

      const user =
        await get(
          `
          SELECT
            id,
            name,
            email,
            phone,
            role,
            location,
            availability,
            created_at
          FROM users
          WHERE id = ?
          `,
          [result.id]
        );


      console.log(
        '✅ REGISTRATION SUCCESSFUL'
      );

      console.log(
        '======================================'
      );


      return res.status(201).json({

        message:
          'Registration successful.',

        token,

        user

      });


    } catch (error) {

      console.error(
        '❌ REGISTRATION ERROR:',
        error
      );


      return res.status(500).json({

        error:
          'Registration failed on the server.'

      });

    }

  }
);


// =========================================================
// LOGIN
// =========================================================

app.post(
  '/api/auth/login',
  async (req, res) => {

    try {

      console.log('');
      console.log(
        '========== LOGIN REQUEST =========='
      );


      const email =
        clean(
          req.body.email
        )?.toLowerCase();


      const password =
        String(
          req.body.password || ''
        );


      console.log(
        'Login email:',
        email
      );


      if (
        !validEmail(email)
      ) {

        return validationError(
          res,
          {
            email:
              'Enter a valid email address.'
          }
        );

      }


      if (!password) {

        return validationError(
          res,
          {
            password:
              'Password is required.'
          }
        );

      }


      // -----------------------------
      // FIND USER
      // -----------------------------

      const user =
        await get(
          `
          SELECT *
          FROM users
          WHERE email = ?
          COLLATE NOCASE
          LIMIT 1
          `,
          [email]
        );


      if (!user) {

        console.log(
          '❌ USER NOT FOUND:',
          email
        );


        return res.status(401).json({

          error:
            'Invalid email or password.'

        });

      }


      console.log(
        '✅ USER FOUND:',
        user.id,
        user.email
      );


      // -----------------------------
      // VERIFY PASSWORD
      // -----------------------------

      const passwordCorrect =
        verifyPassword(
          password,
          user.password_hash
        );


      if (!passwordCorrect) {

        console.log(
          '❌ PASSWORD DOES NOT MATCH'
        );


        return res.status(401).json({

          error:
            'Invalid email or password.'

        });

      }


      console.log(
        '✅ PASSWORD VERIFIED'
      );


      // -----------------------------
      // CREATE TOKEN
      // -----------------------------

      const token =
        await issueToken(
          user.id
        );


      const safeUser = {

        id:
          user.id,

        name:
          user.name,

        email:
          user.email,

        phone:
          user.phone,

        role:
          user.role,

        location:
          user.location,

        availability:
          user.availability,

        created_at:
          user.created_at

      };


      console.log(
        '✅ LOGIN SUCCESSFUL'
      );

      console.log(
        '======================================'
      );


      return res.json({

        message:
          'Login successful.',

        token,

        user:
          safeUser

      });


    } catch (error) {

      console.error(
        '❌ LOGIN ERROR:',
        error
      );


      return res.status(500).json({

        error:
          'Login failed on the server.'

      });

    }

  }
);


// =========================================================
// LOGOUT
// =========================================================

app.post(
  '/api/auth/logout',
  async (req, res) => {

    try {

      const header =
        req.get('authorization') || '';


      const token =
        header.startsWith('Bearer ')
          ? header.slice(7).trim()
          : '';


      if (token) {

        await run(
          'DELETE FROM sessions WHERE token=?',
          [token]
        );

      }


      res.json({

        message:
          'Logged out.'

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Logout failed.'

      });

    }

  }
);


// =========================================================
// CURRENT USER
// =========================================================

app.get(
  '/api/auth/me',
  auth,
  async (req, res) => {

    try {

      const user =
        await get(
          `
          SELECT
            id,
            name,
            email,
            phone,
            role,
            location,
            availability,
            created_at
          FROM users
          WHERE id = ?
          `,
          [req.user.id]
        );


      res.json(user);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to load user.'

      });

    }

  }
);

// =========================================================
// UPDATE PROFILE
// =========================================================

app.put(
  '/api/profile',
  auth,
  async (req, res) => {

    try {

      const name =
        clean(req.body.name);

      const email =
        clean(req.body.email)?.toLowerCase();

      const phone =
        String(
          req.body.phone || ''
        ).replace(/\D/g, '');

      const fields = {};

      if (!validName(name)) {
        fields.name =
          'Enter a valid name using uppercase and lowercase letters.';
      }

      if (!validEmail(email)) {
        fields.email =
          'Enter a valid email address.';
      }

      if (!validPhone(phone)) {
        fields.phone =
          'Phone number must contain exactly 10 digits.';
      }

      if (Object.keys(fields).length) {
        return validationError(
          res,
          fields
        );
      }

      // Check whether another account
      // already uses this email.
      const existingUser =
        await get(
          `
          SELECT id
          FROM users
          WHERE email = ?
          COLLATE NOCASE
          AND id != ?
          LIMIT 1
          `,
          [
            email,
            req.user.id
          ]
        );

      if (existingUser) {
        return res.status(409).json({
          error:
            'An account with this email already exists.'
        });
      }

      await run(
        `
        UPDATE users
        SET
          name = ?,
          email = ?,
          phone = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [
          name,
          email,
          phone,
          req.user.id
        ]
      );

      const updatedUser =
        await get(
          `
          SELECT
            id,
            name,
            email,
            phone,
            role,
            location,
            availability,
            created_at
          FROM users
          WHERE id = ?
          `,
          [
            req.user.id
          ]
        );

      res.json({
        success: true,
        message:
          'Profile updated successfully.',
        user: updatedUser
      });

    } catch (error) {

      console.error(
        'Profile update error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to update profile.'
      });

    }

  }
);


// =========================================================
// PROFILE SUMMARY
// =========================================================

app.get(
  '/api/profile/summary',
  auth,
  async (req, res) => {

    try {

      const items =
        await all(
          `
          SELECT
            id,
            title,
            category,
            status,
            created_at
          FROM items
          WHERE user_id = ?
          ORDER BY id DESC
          `,
          [req.user.id]
        );


      const borrow =
        await all(
          `
          SELECT
            id,
            item_title,
            status,
            created_at
          FROM borrow_requests
          WHERE user_id = ?
          ORDER BY id DESC
          `,
          [req.user.id]
        );


      const volunteers =
        await all(
          `
          SELECT
            id,
            role,
            availability,
            status,
            created_at
          FROM volunteers
          WHERE user_id = ?
          ORDER BY id DESC
          `,
          [req.user.id]
        );


      res.json({

        items,

        borrow,

        volunteers

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to load profile summary.'

      });

    }

  }
);


// =========================================================
// STATS
// =========================================================

app.get(
  '/api/stats',
  async (req, res) => {

    try {

      const books =
        await get(
          `
          SELECT COUNT(*) AS count
          FROM items
          WHERE category = 'Book'
          `
        );


      const clothes =
        await get(
          `
          SELECT COUNT(*) AS count
          FROM items
          WHERE category = 'Clothes'
          `
        );


      const volunteers =
        await get(
          `
          SELECT COUNT(*) AS count
          FROM volunteers
          `
        );


      res.json({

        booksDonated:
          3450 + books.count,

        clothesShared:
          1890 + clothes.count,

        activeVolunteers:
          450 + volunteers.count,

        childrenBenefited:
          1420 +
          books.count * 2 +
          clothes.count * 3

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to load statistics.'

      });

    }

  }
);


// =========================================================
// ITEMS
// =========================================================

app.get(
  '/api/items',
  async (req, res) => {

    try {

      const {
        search,
        category,
        location,
        status
      } = req.query;


      let sql =
        'SELECT * FROM items WHERE 1=1';


      const params = [];


      if (
        category &&
        category !== 'All'
      ) {

        sql +=
          ' AND category=?';

        params.push(category);

      }


      if (
        location &&
        location !== 'All'
      ) {

        sql +=
          ' AND location LIKE ?';

        params.push(
          `%${location}%`
        );

      }


      if (
        status &&
        status !== 'All'
      ) {

        sql +=
          ' AND status=?';

        params.push(status);

      }


      if (
        search &&
        search.trim()
      ) {

        sql +=
          `
          AND (
            title LIKE ?
            OR description LIKE ?
            OR author_or_age LIKE ?
            OR location LIKE ?
            OR sub_category LIKE ?
          )
          `;


        const q =
          `%${search.trim()}%`;


        params.push(
          q,
          q,
          q,
          q,
          q
        );

      }


      const rows =
        await all(
          sql +
          ' ORDER BY id DESC',
          params
        );


      res.json(rows);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


app.get(
  '/api/items/:id',
  async (req, res) => {

    try {

      const item =
        await get(
          `
          SELECT *
          FROM items
          WHERE id = ?
          `,
          [req.params.id]
        );


      if (!item) {

        return res.status(404).json({

          error:
            'Item not found.'

        });

      }


      res.json(item);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to load item.'

      });

    }

  }
);


// =========================================================
// DONATE ITEM
// =========================================================

app.post(
  '/api/items',
  auth,
  async (req, res) => {

    try {

      const b =
        req.body;


      const fields = {};


      if (
        !b.category ||
        !['Book', 'Clothes']
          .includes(b.category)
      ) {

        fields.category =
          'Select Book or Clothes.';

      }


      if (
        !clean(b.title) ||
        clean(b.title).length < 2
      ) {

        fields.title =
          'Title is required.';

      }


      if (!clean(b.location)) {

        fields.location =
          'Location is required.';

      }


      if (
        !validName(
          b.donor_name
        )
      ) {

        fields.donor_name =
          'Enter a normal full name using uppercase and lowercase letters.';

      }


      if (
        !validPhone(
          b.donor_phone
        )
      ) {

        fields.donor_phone =
          'Phone number must contain exactly 10 digits.';

      }


      if (
        Object.keys(fields).length
      ) {

        return validationError(
          res,
          fields
        );

      }


      const result =
        await run(
          `
          INSERT INTO items
          (
            title,
            category,
            sub_category,
            location,
            distance,
            status,
            author_or_age,
            class_or_gender,
            condition,
            donor_name,
            donor_phone,
            description,
            image_url,
            user_id
          )
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            'Available',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
          `,
          [
            clean(b.title),

            b.category,

            clean(b.sub_category) ||
              (
                b.category === 'Book'
                  ? 'Textbook'
                  : 'Casual Wear'
              ),

            clean(b.location),

            clean(b.distance) ||
              '1.0 km',

            clean(b.author_or_age) ||
              'N/A',

            clean(b.class_or_gender) ||
              'General',

            clean(b.condition) ||
              'Good',

            clean(b.donor_name),

            String(
              b.donor_phone
            ).replace(/\D/g, ''),

            clean(b.description) ||
              'Donated with love for the Vasai community.',

            clean(b.image_url) ||
              '',

            req.user.id

          ]
        );


      const item =
        await get(
          `
          SELECT *
          FROM items
          WHERE id = ?
          `,
          [result.id]
        );


      res.status(201).json(item);

    } catch (error) {

      console.error(
        'Donation error:',
        error
      );


      res.status(500).json({

        error:
          'Unable to save donation.'

      });

    }

  }
);


// =========================================================
// VOLUNTEERS
// =========================================================

app.post(
  '/api/volunteers',
  auth,
  async (req, res) => {

    try {

      const b =
        req.body;


      const fields = {};


      if (!validName(b.name)) {

        fields.name =
          'Use a proper first and last name.';

      }


      if (!validEmail(b.email)) {

        fields.email =
          'Enter a valid email.';

      }


      if (!validPhone(b.phone)) {

        fields.phone =
          'Phone number must be exactly 10 digits.';

      }


      if (!clean(b.location)) {

        fields.location =
          'Location is required.';

      }


      if (
        Object.keys(fields).length
      ) {

        return validationError(
          res,
          fields
        );

      }


      const result =
        await run(
          `
          INSERT INTO volunteers
          (
            name,
            email,
            phone,
            location,
            role,
            availability,
            status,
            user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            clean(b.name),

            clean(b.email)
              .toLowerCase(),

            String(
              b.phone
            ).replace(/\D/g, ''),

            clean(b.location),

            clean(b.role) ||
              'Teaching Drive',

            clean(b.availability) ||
              'Flexible',

            'Active',

            req.user.id

          ]
        );


      const volunteer =
        await get(
          `
          SELECT *
          FROM volunteers
          WHERE id = ?
          `,
          [result.id]
        );


      res.status(201).json(
        volunteer
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to register volunteer.'

      });

    }

  }
);


app.get(
  '/api/volunteers',
  async (req, res) => {

    try {

      const rows =
        await all(
          `
          SELECT
            id,
            name,
            email,
            phone,
            location,
            role,
            availability,
            status,
            created_at
          FROM volunteers
          ORDER BY id DESC
          `
        );


      res.json(rows);

    } catch (error) {

      res.status(500).json({

        error:
          'Unable to load volunteers.'

      });

    }

  }
);


// =========================================================
// BORROW
// =========================================================

app.post(
  '/api/borrow',
  auth,
  async (req, res) => {

    try {

      const b =
        req.body;


      const fields = {};


      if (!clean(b.item_title)) {

        fields.item_title =
          'Book title is required.';

      }


      if (
        !validName(
          b.requester_name
        )
      ) {

        fields.requester_name =
          'Use a proper full name.';

      }


      if (
        !validPhone(
          b.requester_phone
        )
      ) {

        fields.requester_phone =
          'Phone number must be exactly 10 digits.';

      }


      if (!clean(b.address)) {

        fields.address =
          'Pickup address is required.';

      }


      if (
        Object.keys(fields).length
      ) {

        return validationError(
          res,
          fields
        );

      }


      const result =
        await run(
          `
          INSERT INTO borrow_requests
          (
            item_id,
            item_title,
            requester_name,
            requester_phone,
            address,
            notes,
            status,
            user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            b.item_id ||
              null,

            clean(b.item_title),

            clean(b.requester_name),

            String(
              b.requester_phone
            ).replace(/\D/g, ''),

            clean(b.address),

            clean(b.notes) || '',

            'Pending',

            req.user.id

          ]
        );


      if (b.item_id) {

        await run(
          `
          UPDATE items
          SET status = 'Reserved'
          WHERE id = ?
          `,
          [b.item_id]
        );

      }


      const borrow =
        await get(
          `
          SELECT *
          FROM borrow_requests
          WHERE id = ?
          `,
          [result.id]
        );


      res.status(201).json(
        borrow
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to save borrow request.'

      });

    }

  }
);


app.get(
  '/api/borrow',
  auth,
  async (req, res) => {

    try {

      const rows =
        await all(
          `
          SELECT *
          FROM borrow_requests
          ORDER BY id DESC
          `
        );


      res.json(rows);

    } catch (error) {

      res.status(500).json({

        error:
          'Unable to load borrow requests.'

      });

    }

  }
);


// =========================================================
// MONETARY DONATION
// =========================================================

app.post(
  '/api/donations',
  auth,
  async (req, res) => {

    try {

      const b =
        req.body;


      const amount =
        Number(b.amount);


      if (
        !validName(b.donor_name) ||
        !validEmail(b.email) ||
        !Number.isInteger(amount) ||
        amount < 1
      ) {

        return res.status(400).json({

          error:
            'Enter valid donor name, email and amount.'

        });

      }


      const result =
        await run(
          `
          INSERT INTO monetary_donations
          (
            donor_name,
            email,
            amount,
            cause,
            user_id
          )
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            clean(b.donor_name),

            clean(b.email)
              .toLowerCase(),

            amount,

            clean(b.cause) ||
              'Education & Clothes',

            req.user.id

          ]
        );


      res.status(201).json({

        id:
          result.id,

        message:
          'Thank you for your generous donation!'

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to save donation.'

      });

    }

  }
);


// =========================================================
// CONTACT
// =========================================================

app.post(
  '/api/contact',
  auth,
  async (req, res) => {

    try {

      const b =
        req.body;


      if (
        !validName(b.name) ||
        !validEmail(b.email) ||
        !clean(b.message)
      ) {

        return res.status(400).json({

          error:
            'Please enter valid contact details and message.'

        });

      }


      const result =
        await run(
          `
          INSERT INTO contact_messages
          (
            name,
            email,
            subject,
            message,
            user_id
          )
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            clean(b.name),

            clean(b.email)
              .toLowerCase(),

            clean(b.subject) ||
              'General Query',

            clean(b.message),

            req.user.id

          ]
        );


      res.status(201).json({

        id:
          result.id,

        message:
          'Your message has been sent successfully!'

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to save contact message.'

      });

    }

  }
);


// =========================================================
// COMMUNITY
// =========================================================

app.get(
  '/api/community',
  async (req, res) => {

    try {

      const rows =
        await all(
          `
          SELECT *
          FROM community_updates
          ORDER BY id DESC
          `
        );


      res.json(rows);

    } catch (error) {

      res.status(500).json({

        error:
          'Unable to load community updates.'

      });

    }

  }
);


// =========================================================
// NOTIFICATIONS
// =========================================================

app.get(
  '/api/notifications',
  async (req, res) => {

    try {

      const rows =
        await all(
          `
          SELECT
            id,
            title,
            message,
            location AS time,
            '📢' AS icon
          FROM community_updates
          ORDER BY id DESC
          LIMIT 10
          `
        );


      res.json(rows);

    } catch (error) {

      res.status(500).json({

        error:
          'Unable to load notifications.'

      });

    }

  }
);


// =========================================================
// ITEM STATUS
// =========================================================

app.patch(
  '/api/items/:id/status',
  auth,
  async (req, res) => {

    try {

      const allowed = [
        'Available',
        'Reserved',
        'Collected'
      ];


      if (
        !allowed.includes(
          req.body.status
        )
      ) {

        return res.status(400).json({

          error:
            'Invalid status.'

        });

      }


      await run(
        `
        UPDATE items
        SET status = ?
        WHERE id = ?
        `,
        [
          req.body.status,
          req.params.id
        ]
      );


      const item =
        await get(
          `
          SELECT *
          FROM items
          WHERE id = ?
          `,
          [req.params.id]
        );


      res.json(item);

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to update item.'

      });

    }

  }
);


// =========================================================
// DELETE ITEM
// =========================================================

app.delete(
  '/api/items/:id',
  auth,
  async (req, res) => {

    try {

      await run(
        `
        DELETE FROM items
        WHERE id = ?
        `,
        [req.params.id]
      );


      res.json({

        message:
          'Item deleted.'

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        error:
          'Unable to delete item.'

      });

    }

  }
);


// =========================================================
// 404 API HANDLER
// =========================================================

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({

      error:
        `API route not found: ${req.method} ${req.originalUrl}`

    });

  }
);


// =========================================================
// START SERVER
// =========================================================

async function startServer() {

  try {

    console.log('');
    console.log(
      'Starting Helping Hands server...'
    );


    await initDB();


    console.log(
      '✅ Database initialized successfully.'
    );


    const server =
      app.listen(
        PORT,
        '127.0.0.1',
        () => {

          console.log('');
          console.log(
            '=========================================='
          );

          console.log(
            '✅ HELPING HANDS SERVER IS RUNNING'
          );

          console.log(
            '=========================================='
          );

          console.log(
            `🌐 Website: http://localhost:${PORT}`
          );

          console.log(
            `🔐 Register: http://localhost:${PORT}/register.html`
          );

          console.log(
            `🔑 Login: http://localhost:${PORT}/login.html`
          );

          console.log(
            `🗄️ Database: ${dbPath}`
          );

          console.log(
            '=========================================='
          );

          console.log('');

        }
      );


    server.on(
      'error',
      (error) => {

        console.error(
          '❌ SERVER ERROR:',
          error
        );


        if (
          error.code ===
          'EADDRINUSE'
        ) {

          console.error(
            `❌ Port ${PORT} is already being used.`
          );

        }

      }
    );


  } catch (error) {

    console.error('');
    console.error(
      '❌ SERVER FAILED TO START'
    );

    console.error(
      error
    );

    process.exit(1);

  }

}


startServer();