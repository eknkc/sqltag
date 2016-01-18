export default function SQL(parts, ...values) {
  if (typeof parts === 'string')
    parts = [parts];

  return new Fragment(parts, values)
}

SQL.dialect = "pg";

const DIALECT = {
  pg: {
    escape(index) {
      return `$${index}`
    },

    quote(name) {
      return '"' + name.replace(/\"/g, '""') + '"';
    }
  },

  mysql: {
    escape(index) {
      return "?";
    },

    quote(name) {
      return '`' + name.replace(/`/g, '``').replace(/\./g, '`.`') + '`';
    }
  }
}

function vals(values) {
  var keys = Object.keys(values);

  var parts = [`(${keys.map(quote).join(", ")}) VALUES (`, ...(keys.slice(1).map(() => ", ")), ")"];
  var vals = [];

  keys.forEach(function (key) {
    vals.push(values[key])
  });

  return new Fragment(parts, vals);
}

function set(values) {
  var keys = Object.keys(values);

  var parts = [];
  var vals = [];

  keys.forEach(function (key, i) {
    parts.push(`${i > 0 ? ", " : "SET "}${quote(key)} = `)
    vals.push(values[key])
  });

  parts.push("");

  return new Fragment(parts, vals);
}

function where(query) {
  return SQL`WHERE ${{ $expr: query }}`;
}

function expr(query) {
  var keys = Object.keys(query);

  var parts = [];
  var vals = [];

  keys.forEach(function (key, i) {
    parts.push(`${i > 0 ? " AND " : "("}${quote(key)} = `)
    vals.push(query[key])
  });

  parts.push(")");

  return new Fragment(parts, vals);
}

function cols(cols) {
  if (!Array.isArray(cols))
    cols = Object.keys(cols);

  cols = cols.map(quote).join(", ");

  return new Fragment(cols, []);
}

function valin(arr) {
  return SQL`IN (${{ $spread: arr }})`
}

function spread(arr) {
  if (!Array.isArray(arr))
    arr = [arr];

  var parts = ['', ...(arr.map(e => ", ").slice(1))]

  return new Fragment(parts, arr);
}

function quote(name) {
  return DIALECT[SQL.dialect].quote(name);
}

class Fragment {
  constructor(parts, values) {
    this.values = values
    this.parts = parts
  }

  sql(offset = 1, root = true) {
    var text = ""
      , values = []
      , dialect = DIALECT[SQL.dialect]

    for (var i = 0; i < this.parts.length; i++) {
      var part = this.parts[i];

      if (this.values.length <= i) {
        text += part;
        continue;
      }

      var value = this.values[i];

      if (typeof value === 'object' && value) {
        if (value.$vals) value = vals(value.$vals);
        else if (value.$expr) value = expr(value.$expr);
        else if (value.$where) value = where(value.$where);
        else if (value.$set) value = set(value.$set);
        else if (value.$cols) value = cols(value.$cols);
        else if (value.$json) value = JSON.stringify(value.$json);
        else if (value.$spread) value = spread(value.$spread);
        else if (value.$in) value = valin(value.$in);
        else if (value.$name) value = new Fragment(dialect.quote(value.$name), []);
      }

      if (value instanceof Fragment) {
        var innersql = value.sql(offset, false);

        text += part + innersql.text;
        offset += innersql.values.length;

        values.push(...innersql.values);
      } else {
        text += part + dialect.escape(offset++);
        values.push(value);
      }
    };

    return {
      text: root ? text.replace(/\n\s*/gm, " ") : text,
      values
    }
  }

  clone() {
    return new Fragment(this.parts.slice(), this.values.slice());
  }
}
