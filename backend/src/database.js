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
  adjacent_pipelines: [],
  gas_detections: [],
  responsible_persons: [],
  operation_logs: [],
  pause_records: [],
};

const COLUMN_DEFAULTS = {
  work_tickets: {
    status: 'draft',
    retest_interval: 30,
    combustible_limit: 0.5,
    oxygen_min: 19.5,
    oxygen_max: 23.5,
    is_locked: 0,
    lock_type: null,
    lock_reason: null,
    locked_at: null,
    pipeline_confirmed_by: null,
    pipeline_confirmed_at: null,
    last_retest_at: null,
    resume_confirmed_by: null,
    resume_confirmed_at: null,
  },
  isolation_blind_plates: {
    installed: 0,
    removed: 0,
    confirmed_by: null,
    confirmed_at: null,
  },
  adjacent_pipelines: {
    confirmed: 0,
    confirmed_by: null,
    confirmed_at: null,
    pressure_status: 'normal',
    has_leak: 0,
  },
  gas_detections: {
    is_qualified: 1,
    remark: '',
    is_retest: 0,
  },
  responsible_persons: {
    confirmed_at: null,
    signature: null,
  },
  pause_records: {
    resumed_at: null,
    resumed_by: null,
    resume_remark: '',
    detection_curve_data: null,
    resume_confirmed_by: null,
    resume_confirmed_at: null,
    retest_detection_id: null,
  },
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

function normalizeValueForCompare(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    if (!isNaN(n) && val.trim() !== '') return n;
    return val;
  }
  return val;
}

function parseWhereClause(whereStr, params) {
  if (!whereStr || !whereStr.trim()) {
    return () => true;
  }

  const tokens = whereStr.trim();
  const conditions = [];
  let paramIndex = 0;

  const parts = [];
  let depth = 0;
  let buf = '';
  const up = tokens.toUpperCase();
  let i = 0;
  while (i < tokens.length) {
    if (up.substr(i, 4) === ' AND' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      i += 4;
      while (i < tokens.length && tokens[i] === ' ') i++;
      continue;
    }
    if (tokens[i] === '(') depth++;
    if (tokens[i] === ')') depth--;
    buf += tokens[i];
    i++;
  }
  if (buf.trim()) parts.push(buf.trim());

  parts.forEach(part => {
    if (!part) return;
    if (part === '1=1' || part.toUpperCase() === '1=1') {
      conditions.push({ type: 'always_true' });
      return;
    }

    const likeMatch = part.match(/^(\w+)\s+LIKE\s+(\?|'[^']*')$/i);
    if (likeMatch) {
      const col = likeMatch[1];
      let pattern;
      if (likeMatch[2] === '?') {
        pattern = params[paramIndex++];
      } else {
        pattern = likeMatch[2].slice(1, -1);
      }
      const regex = new RegExp('^' + String(pattern).split('%').join('.*') + '$', 'i');
      conditions.push({
        type: 'like',
        column: col,
        test: (val) => regex.test(String(val || ''))
      });
      return;
    }

    const isNullMatch = part.match(/^(\w+)\s+IS\s+NULL$/i);
    if (isNullMatch) {
      const col = isNullMatch[1];
      conditions.push({
        type: 'isnull',
        column: col,
        test: (val) => val === undefined || val === null || val === ''
      });
      return;
    }

    const isNotNullMatch = part.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const col = isNotNullMatch[1];
      conditions.push({
        type: 'isnotnull',
        column: col,
        test: (val) => val !== undefined && val !== null && val !== ''
      });
      return;
    }

    const neqMatch = part.match(/^(\w+)\s*(!=|<>)\s*\?$/i);
    if (neqMatch) {
      const col = neqMatch[1];
      const expected = params[paramIndex++];
      conditions.push({
        type: 'neq',
        column: col,
        test: (val) => {
          const a = normalizeValueForCompare(val);
          const b = normalizeValueForCompare(expected);
          return a !== b;
        }
      });
      return;
    }

    const eqMatch = part.match(/^(\w+)\s*=\s*\?$/i);
    if (eqMatch) {
      const col = eqMatch[1];
      const expected = params[paramIndex++];
      conditions.push({
        type: 'eq',
        column: col,
        test: (val) => {
          const a = normalizeValueForCompare(val);
          const b = normalizeValueForCompare(expected);
          if (typeof a === 'number' && typeof b === 'number') return a === b;
          return String(a) === String(b);
        }
      });
      return;
    }

    const gtMatch = part.match(/^(\w+)\s*(>|<|>=|<=)\s*\?$/i);
    if (gtMatch) {
      const col = gtMatch[1];
      const op = gtMatch[2];
      const expected = params[paramIndex++];
      conditions.push({
        type: 'compare',
        column: col,
        test: (val) => {
          const a = normalizeValueForCompare(val);
          const b = normalizeValueForCompare(expected);
          switch (op) {
            case '>': return a > b;
            case '<': return a < b;
            case '>=': return a >= b;
            case '<=': return a <= b;
          }
          return false;
        }
      });
      return;
    }

    const literalNumMatch = part.match(/^(\w+)\s*(!=|<>|>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/i);
    if (literalNumMatch) {
      const col = literalNumMatch[1];
      const op = literalNumMatch[2];
      const expected = Number(literalNumMatch[3]);
      conditions.push({
        type: 'compare',
        column: col,
        test: (val) => {
          const a = normalizeValueForCompare(val);
          const b = expected;
          switch (op) {
            case '=': return a === b;
            case '!=': case '<>': return a !== b;
            case '>': return a > b;
            case '<': return a < b;
            case '>=': return a >= b;
            case '<=': return a <= b;
          }
          return false;
        }
      });
      return;
    }

    const literalStrMatch = part.match(/^(\w+)\s*=\s*'([^']*)'$/i);
    if (literalStrMatch) {
      const col = literalStrMatch[1];
      const expected = literalStrMatch[2];
      conditions.push({
        type: 'eq',
        column: col,
        test: (val) => String(val || '') === expected
      });
      return;
    }

    const resumedAtIsNull = part.match(/^(\w+)\s+IS\s+NULL$/i);
    if (!resumedAtIsNull) {
      conditions.push({ type: 'always_true' });
    }
  });

  return (row) => {
    for (const cond of conditions) {
      if (cond.type === 'always_true') continue;
      const val = row[cond.column];
      if (!cond.test(val)) return false;
    }
    return true;
  };
}

function parseColumns(selectStr) {
  if (selectStr.trim() === '*') {
    return null;
  }
  if (/COUNT\(\s*(?:\*|\w+)\s*\)/i.test(selectStr)) {
    return { type: 'count' };
  }
  const cols = selectStr.split(',').map(s => {
    const asMatch = s.match(/\s+AS\s+(\w+)$/i);
    if (asMatch) return asMatch[1];
    const parts = s.trim().split(/\s+/);
    return parts[parts.length - 1];
  });
  return { type: 'columns', cols };
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
    const defaults = COLUMN_DEFAULTS[this.tableName] || {};
    const rec = { ...defaults, ...record };
    if (!rec.id) rec.id = uuidv4();
    if (!rec.created_at) rec.created_at = new Date().toISOString();

    if (this.tableName === 'isolation_blind_plates') {
      rec.installed = normalizeValueForCompare(rec.installed);
      rec.removed = normalizeValueForCompare(rec.removed);
    }
    if (this.tableName === 'adjacent_pipelines') {
      rec.confirmed = normalizeValueForCompare(rec.confirmed);
      rec.has_leak = normalizeValueForCompare(rec.has_leak);
    }
    if (this.tableName === 'gas_detections') {
      if (rec.is_qualified !== undefined) {
        rec.is_qualified = normalizeValueForCompare(rec.is_qualified);
      }
      if (rec.is_retest !== undefined) {
        rec.is_retest = normalizeValueForCompare(rec.is_retest);
      }
    }
    if (this.tableName === 'work_tickets') {
      if (rec.is_locked !== undefined) {
        rec.is_locked = normalizeValueForCompare(rec.is_locked);
      }
    }

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
}

const tables = {
  work_tickets: new Table('work_tickets'),
  isolation_blind_plates: new Table('isolation_blind_plates'),
  adjacent_pipelines: new Table('adjacent_pipelines'),
  gas_detections: new Table('gas_detections'),
  responsible_persons: new Table('responsible_persons'),
  operation_logs: new Table('operation_logs'),
  pause_records: new Table('pause_records'),
};

const db = {
  prepare(sql) {
    const trimmed = sql.trim();
    const upperSql = trimmed.toUpperCase();

    if (upperSql.startsWith('SELECT')) {
      const selectMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)/is);
      if (!selectMatch) {
        return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) };
      }

      const columnsPart = selectMatch[1];
      const tableName = selectMatch[2];
      const colInfo = parseColumns(columnsPart);

      const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT\s|$)/is);
      const orderMatch = trimmed.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT\s|$)/is);
      const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);

      return {
        all(...params) {
          if (!tables[tableName]) return [];

          const whereStr = whereMatch ? whereMatch[1] : '';
          const whereFn = parseWhereClause(whereStr, params);

          let result = tables[tableName].all().filter(row => whereFn(row));

          if (orderMatch) {
            const orderStr = orderMatch[1].trim();
            const parts = orderStr.split(',');
            result.sort((a, b) => {
              for (const p of parts) {
                const [col, dir] = p.trim().split(/\s+/);
                const av = normalizeValueForCompare(a[col]);
                const bv = normalizeValueForCompare(b[col]);
                if (av !== bv) {
                  let cmp = 0;
                  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
                  else cmp = String(av) > String(bv) ? 1 : -1;
                  return (dir && dir.toUpperCase() === 'DESC') ? -cmp : cmp;
                }
              }
              return 0;
            });
          }

          if (limitMatch) {
            result = result.slice(0, parseInt(limitMatch[1]));
          }

          if (colInfo && colInfo.type === 'count') {
            return [{ count: result.length }];
          }

          if (colInfo && colInfo.type === 'columns') {
            return result.map(row => {
              const newRow = {};
              colInfo.cols.forEach(c => { newRow[c] = row[c]; });
              return newRow;
            });
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

    if (upperSql.startsWith('UPDATE')) {
      const tableMatch = trimmed.match(/UPDATE\s+(\w+)/i);
      const setMatch = trimmed.match(/SET\s+(.+?)\s+WHERE\s+/is);
      const whereMatch = trimmed.match(/WHERE\s+(.+?)$/is);
      const tableName = tableMatch ? tableMatch[1] : null;

      return {
        run(...params) {
          if (!tableName || !tables[tableName]) return { changes: 0 };

          const setStr = setMatch ? setMatch[1].trim() : '';
          const setItems = [];
          const commaParts = [];
          let depth = 0;
          let buf = '';
          for (let i = 0; i < setStr.length; i++) {
            const ch = setStr[i];
            if (ch === ',' && depth === 0) {
              commaParts.push(buf.trim());
              buf = '';
              continue;
            }
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            buf += ch;
          }
          if (buf.trim()) commaParts.push(buf.trim());

          commaParts.forEach(s => {
            const idx = s.indexOf('=');
            if (idx > 0) {
              setItems.push({
                col: s.substring(0, idx).trim(),
                val: s.substring(idx + 1).trim()
              });
            }
          });

          let paramIdx = 0;
          const updates = {};
          setItems.forEach(item => {
            if (item.val === '?') {
              updates[item.col] = params[paramIdx++];
            } else if (/^CURRENT_TIMESTAMP$/i.test(item.val.trim())) {
              updates[item.col] = new Date().toISOString();
            } else if (/^NULL$/i.test(item.val.trim())) {
              updates[item.col] = null;
            } else if (item.val.startsWith("'") && item.val.endsWith("'")) {
              updates[item.col] = item.val.slice(1, -1);
            } else if (!isNaN(Number(item.val)) && item.val.trim() !== '') {
              updates[item.col] = Number(item.val);
            } else {
              updates[item.col] = item.val;
            }
          });

          const whereStr = whereMatch ? whereMatch[1].trim() : '';
          const whereParams = params.slice(paramIdx);
          const whereFn = parseWhereClause(whereStr, whereParams);

          const count = tables[tableName].updateWhere(row => whereFn(row), updates);
          return { changes: count };
        },
      };
    }

    if (upperSql.startsWith('INSERT')) {
      const tableMatch = trimmed.match(/INTO\s+(\w+)\s*\(([^)]+)\)/i);
      const valuesMatch = trimmed.match(/VALUES\s*\(([^)]+)\)/i);

      return {
        run(...params) {
          if (!tableMatch) return { lastInsertRowid: null };
          const tableName = tableMatch[1];
          if (!tables[tableName]) return { lastInsertRowid: null };

          const cols = tableMatch[2].split(',').map(s => s.trim());
          const record = {};
          cols.forEach((col, i) => {
            record[col] = params[i];
          });

          const inserted = tables[tableName].insert(record);
          return { lastInsertRowid: inserted.id };
        },
      };
    }

    if (upperSql.startsWith('CREATE') || upperSql.startsWith('PRAGMA')) {
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
