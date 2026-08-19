import sqlite3Module from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlite3 = sqlite3Module.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use DB_PATH if provided, otherwise store database beside db.js
const dbPath =
  process.env.DB_PATH || path.join(__dirname, 'helping_hands.db');

console.log('Using SQLite database:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection failed:', err.message);
  } else {
    console.log('✅ SQLite database connected');
  }
});


// =========================================================
// RUN
// INSERT / UPDATE / DELETE / CREATE TABLE
// =========================================================

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        console.error('❌ SQLite RUN error:', err.message);
        console.error('SQL:', sql);
        reject(err);
      } else {
        resolve({
          id: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}


// =========================================================
// GET
// Return ONE row
// =========================================================

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error('❌ SQLite GET error:', err.message);
        console.error('SQL:', sql);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}


// =========================================================
// ALL
// Return MULTIPLE rows
// =========================================================

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ SQLite ALL error:', err.message);
        console.error('SQL:', sql);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}


// =========================================================
// DATABASE INITIALIZATION
// =========================================================

async function initDB() {

  // Enable foreign keys
  await run('PRAGMA foreign_keys = ON');


  // =======================================================
  // USERS
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      location TEXT,
      availability TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);


  // =======================================================
  // SESSIONS
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);


  // =======================================================
  // ITEMS
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT,
      location TEXT NOT NULL,
      distance TEXT,
      status TEXT DEFAULT 'Available',
      author_or_age TEXT,
      class_or_gender TEXT,
      condition TEXT,
      donor_name TEXT NOT NULL,
      donor_phone TEXT,
      description TEXT,
      image_url TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);


  // =======================================================
  // VOLUNTEERS
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      location TEXT NOT NULL,
      role TEXT NOT NULL,
      availability TEXT,
      status TEXT DEFAULT 'Pending',
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);


  // =======================================================
  // BORROW REQUESTS
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS borrow_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      item_title TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_phone TEXT NOT NULL,
      address TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Pending',
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(item_id)
        REFERENCES items(id)
        ON DELETE SET NULL,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);


  // =======================================================
  // MONETARY DONATIONS
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS monetary_donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donor_name TEXT NOT NULL,
      email TEXT NOT NULL,
      amount INTEGER NOT NULL,
      cause TEXT,
      payment_method TEXT DEFAULT 'UPI',
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);


  // =======================================================
  // CONTACT MESSAGES
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);


  // =======================================================
  // COMMUNITY UPDATES
  // =======================================================

  await run(`
    CREATE TABLE IF NOT EXISTS community_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      location TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);


  // =======================================================
  // SAFE MIGRATIONS
  // =======================================================

  const migrations = [
    ['items', 'user_id', 'INTEGER'],
    ['items', 'image_url', 'TEXT'],
    ['volunteers', 'user_id', 'INTEGER'],
    ['borrow_requests', 'user_id', 'INTEGER'],
    ['monetary_donations', 'user_id', 'INTEGER'],
    ['contact_messages', 'user_id', 'INTEGER']
  ];

  for (const [table, column, type] of migrations) {

    const columns = await all(`PRAGMA table_info(${table})`);

    if (!columns.some((columnInfo) => columnInfo.name === column)) {

      console.log(
        `Adding missing column ${column}.${column}`
      );

      await run(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`
      );
    }
  }


  // =======================================================
  // DEFAULT ITEMS
  // =======================================================

  const itemCount = await get(
    'SELECT COUNT(*) AS count FROM items'
  );

  if (itemCount.count === 0) {

    const items = [

      [
        'Mathematics Class 10 (NCERT)',
        'Book',
        'Textbooks',
        'Vasai West',
        '0.8 km',
        'Available',
        'R.D. Sharma',
        'Class 10',
        'Good (90%)',
        'Rajesh Sharma',
        '+91 98765 43210',
        'NCERT Class 10 Mathematics textbook in excellent condition with clear solved examples.',
        'https://images.unsplash.com/photo-1599689868384-59cb2b01bb21?auto=format&fit=crop&w=600&q=80'
      ],

      [
        'Winter Woolen Sweaters (Pack of 3)',
        'Clothes',
        'Warm Wear',
        'Vasai East',
        '1.2 km',
        'Available',
        '8-12 Years',
        'Unisex',
        'Like New',
        'Priya Deshmukh',
        '+91 98234 56789',
        'Warm high-quality winter woolen sweaters suitable for kids aged 8 to 12 years.',
        'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=600&q=80'
      ],

      [
        'Science & Technology Explorer',
        'Book',
        'Reference',
        'Nalasopara West',
        '3.5 km',
        'Reserved',
        'Dr. H. C. Verma',
        'Class 8-9',
        'Fair',
        'Amit Patel',
        '+91 97112 33445',
        'Comprehensive physics and chemistry reference book with diagrams and practice questions.',
        'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?auto=format&fit=crop&w=600&q=80'
      ],

      [
        'School Uniform Sets (White & Blue)',
        'Clothes',
        'School Uniform',
        'Virar West',
        '5.1 km',
        'Available',
        '10-14 Years',
        'Boys',
        'Good',
        'Sunita Patil',
        '+91 99887 76655',
        'Pair of blue trousers and white shirts for secondary school students in Vasai/Virar region.',
        'https://images.unsplash.com/photo-1593113616828-6f22bca04804?auto=format&fit=crop&w=600&q=80'
      ],

      [
        'English Grammar & Composition',
        'Book',
        'Language',
        'Mumbai Central',
        '12 km',
        'Collected',
        'Wren & Martin',
        'Class 6-8',
        'Good',
        'Meena Kulkarni',
        '+91 91234 56780',
        'Classic English grammar guide essential for middle school students learning sentence structures.',
        'https://images.unsplash.com/photo-1516042438821-0abd7a73c4b3?auto=format&fit=crop&w=600&q=80'
      ],

      [
        'Kids Casual Jackets & Rainwear',
        'Clothes',
        'Outerwear',
        'Vasai West',
        '1.5 km',
        'Available',
        '5-9 Years',
        'Unisex',
        'Like New',
        'Vikram Joshi',
        '+91 98900 11223',
        'Waterproof raincoat and cozy windbreaker jacket for school commuting during monsoon.',
        'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=600&q=80'
      ]

    ];

    for (const item of items) {

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
          image_url
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `,
        item
      );

    }
  }


  // =======================================================
  // DEFAULT VOLUNTEERS
  // =======================================================

  const volunteerCount = await get(
    'SELECT COUNT(*) AS count FROM volunteers'
  );

  if (volunteerCount.count === 0) {

    const volunteers = [

      [
        'Aarav Mehta',
        'aarav@gmail.com',
        '+91 98111 22334',
        'Vasai West',
        'Teaching Drive',
        'Weekends',
        'Active'
      ],

      [
        'Neha Gupta',
        'neha@gmail.com',
        '+91 98222 33445',
        'Virar East',
        'Book Sorting',
        'Weekdays',
        'Active'
      ],

      [
        'Siddharth Rao',
        'sid@gmail.com',
        '+91 98333 44556',
        'Nalasopara West',
        'Clothes Distribution',
        'Any time',
        'Pending'
      ]

    ];

    for (const volunteer of volunteers) {

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
          status
        )
        VALUES (?,?,?,?,?,?,?)
        `,
        volunteer
      );

    }
  }


  // =======================================================
  // DEFAULT COMMUNITY UPDATES
  // =======================================================

  const communityCount = await get(
    'SELECT COUNT(*) AS count FROM community_updates'
  );

  if (communityCount.count === 0) {

    const updates = [

      [
        'Book Collection Drive',
        'Class 10 books available for students in Vasai West.',
        'Vasai West',
        'Books'
      ],

      [
        'Winter Clothes Drive',
        'Warm clothes and school uniforms are available for local families.',
        'Vasai East',
        'Clothes'
      ],

      [
        'Volunteer Teaching Drive',
        'Weekend volunteers are helping children with school subjects.',
        'Virar East',
        'Volunteer'
      ]

    ];

    for (const update of updates) {

      await run(
        `
        INSERT INTO community_updates
        (
          title,
          message,
          location,
          category
        )
        VALUES (?,?,?,?)
        `,
        update
      );

    }
  }

  console.log('✅ Database initialization completed successfully.');
}


// =========================================================
// EXPORTS
// =========================================================

export {
  db,
  dbPath,
  run,
  get,
  all,
  initDB
};