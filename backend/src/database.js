const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dbDir, 'hotwork.json');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const defaultData = {
  work_tickets: [],
  isolation_blind_plates: [],
  gas_detections: [],
  responsible_persons: [],
  operation_logs: [],
  pause_records: [],
};

function readDB() {
  if (!fs.existsSync(dbFile)) {
    return JSON.parse(JSON.stringify(defaultData));
  }
  try {
    const data = fs.readFileSync(dbFile, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('读取数据库文件失败:', e);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入数据库文件失败:', e);
    throw e;
  }
}

function initDatabase() {
  const data = readDB();
  writeDB(data);
  console.log('JSON 数据库初始化完成，文件路径:', dbFile);
  return db;
}

class Table {
  constructor(tableName) {
    this.tableName = tableName;
  }

  all() {
    const data = readDB();
    return data[this.tableName] || [];
  }

  filter(fn) {
    return this.all().filter(fn);
  }

  find(fn) {
    return this.all().find(fn);
  }

  get(id) {
    return this.find(r => r.id === id);
  }

  insert(record) {
    const data = readDB();
    const rec = { ...record };
    if (!rec.id) rec.id = uuidv4();
    if (!rec.created_at) rec.created_at = new Date().toISOString();
    data[this.tableName].push(rec);
    writeDB(data);
    return rec;
  }

  update(id, updates) {
    const data = readDB();
    const idx = data[this.tableName].findIndex(r => r.id === id);
    if (idx === -1) return null;
    data[this.tableName][idx] = { ...data[this.tableName][idx], ...updates };
    writeDB(data);
    return data[this.tableName][idx];
  }

  updateWhere(whereFn, updates) {
    const data = readDB();
    let count = 0;
    data[this.tableName] = data[this.tableName].map(r => {
      if (whereFn(r)) {
        count++;
        return { ...r, ...updates };
      }
      return r;
    });
    writeDB(data);
    return count;
  }

  runInsert(sql, params) {
    const record = {};
    params.forEach((v, i) => {
      if (i < 20) {
        const colMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/);
        if (colMatch) {
          const cols = colMatch[1].split(',').map(s => s.trim());
          record[cols[i]] = v;
        }
      }
    });
    return this.insert(record);
  }
}

const tables = {
  work_tickets: new Table('work_tickets'),
  isolation_blind_plates: new Table('isolation_blind_plates'),
  gas_detections: new Table('gas_detections'),
  responsible_persons: new Table('responsible_persons'),
  operation_logs: new Table('operation_logs'),
  pause_records: new Table('pause_records'),
};

const db = {
  prepare(sql) {
    const trimmed = sql.trim();

    if (trimmed.toUpperCase().startsWith('SELECT')) {
      const whereMatch = trimmed.match(/WHERE (.+?)(?: ORDER | LIMIT |$)/is);
      const orderMatch = trimmed.match(/ORDER BY (.+?)(?: LIMIT |$)/is);
      const limitMatch = trimmed.match(/LIMIT (\d+)/i);
      const tableMatch = trimmed.match(/FROM (\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : null;

      return {
        all(...params) {
          if (!tableName || !tables[tableName]) return [];
          let result = tables[tableName].all();
          if (orderMatch) {
            const orderStr = orderMatch[1].trim();
            const [col, dir] = orderStr.split(/\s+/);
            result.sort((a, b) => {
              if (a[col] === b[col]) return 0;
              const cmp = a[col] > b[col] ? 1 : -1;
              return (dir && dir.toUpperCase() === 'DESC') ? -cmp : cmp;
            });
          }
          if (limitMatch) {
            result = result.slice(0, parseInt(limitMatch[1]));
          }
          return result;
        },
        get(...params) {
          const results = this.all(...params);
          return results[0] || undefined;
        },
        run(...params) {
          return { changes: this.all(...params).length };
        },
      };
    }

    if (trimmed.toUpperCase().startsWith('UPDATE')) {
      const tableMatch = trimmed.match(/UPDATE (\w+)/i);
      const setMatch = trimmed.match(/SET (.+?) WHERE /is);
      const whereMatch = trimmed.match(/WHERE (.+?)$/is);
      const tableName = tableMatch ? tableMatch[1] : null;

      return {
        run(...params) {
          if (!tableName || !tables[tableName]) return { changes: 0 };
          const setStr = setMatch ? setMatch[1].trim() : '';
          const sets = setStr.split(',').map(s => s.trim().split('=')[0].trim());

          let paramIdx = 0;
          const updates = {};
          sets.forEach((col, i) => {
            updates[col] = params[paramIdx++];
          });

          const whereStr = whereMatch ? whereMatch[1].trim() : '';
          const hasIdEq = whereStr.includes('id = ?') || whereStr.includes('id=?');
          const hasTicketEq = whereStr.includes('ticket_id = ?') || whereStr.includes('ticket_id=?');

          let count = 0;
          if (hasIdEq && params.length - paramIdx >= 1) {
            const id = params[paramIdx];
            const updated = tables[tableName].update(id, updates);
            count = updated ? 1 : 0;
          } else if (hasTicketEq) {
            const tid = params[paramIdx];
            count = tables[tableName].updateWhere(r => r.ticket_id === tid, updates);
          } else {
            count = tables[tableName].updateWhere(() => true, updates);
          }

          return { changes: count };
        },
      };
    }

    if (trimmed.toUpperCase().startsWith('INSERT')) {
      const tableMatch = trimmed.match(/INTO (\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : null;
      const colsMatch = trimmed.match(/\(([^)]+)\)/);
      const cols = colsMatch ? colsMatch[1].split(',').map(s => s.trim()) : [];

      return {
        run(...params) {
          if (!tableName || !tables[tableName]) return { lastInsertRowid: null };
          const record = {};
          cols.forEach((col, i) => {
            record[col] = params[i];
          });
          if (record.ticket_id === undefined && tableName !== 'work_tickets') {
            record.ticket_id = '';
          }
          const inserted = tables[tableName].insert(record);
          return { lastInsertRowid: inserted.id };
        },
      };
    }

    if (trimmed.toUpperCase().startsWith('CREATE') || trimmed.toUpperCase().startsWith('PRAGMA')) {
      return { run: () => ({ changes: 0 }) };
    }

    return {
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0 }),
    };
  },

  pragma: () => {},
  exec: () => {},
  transaction: (fn) => {
    const data = readDB();
    try {
      fn();
      return () => {};
    } catch (e) {
      console.error('事务执行失败，回滚:', e);
      writeDB(data);
      throw e;
    }
  },
};

module.exports = { initDatabase, db, tables };
