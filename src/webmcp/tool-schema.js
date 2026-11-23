/* SPDX-License-Identifier: MIT */
'use strict';

// Fail-closed JSON Schema subset. Unknown semantic keywords are NOT ignored.
// This is deliberately not a general JSON Schema implementation.
const KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties',
  'items', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength',
  'minItems', 'maxItems', 'description', 'title']);
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const MAX_NODES = 256;
const MAX_DEPTH = 16;

function validateSchemaDefinition(schema) {
  let nodes = 0;
  const requireBound = (value) => Number.isSafeInteger(value) && value >= 0;
  function inspect(node, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH || node === null ||
        typeof node !== 'object' || Array.isArray(node)) throw new Error('unsupported_schema');
    for (const keyword of Object.keys(node)) {
      if (!KEYWORDS.has(keyword)) throw new Error('unsupported_schema_keyword');
    }
    if (!TYPES.has(node.type)) throw new Error('unsupported_schema_type');
    for (const key of ['title', 'description']) {
      if (node[key] !== undefined && typeof node[key] !== 'string') {
        throw new Error('unsupported_schema_metadata');
      }
    }
    // Only the deliberately implemented keyword/type combinations are accepted.
    // Ignoring a schema constraint would be less safe than refusing the tool.
    const typeKeywords = {
      object: ['properties', 'required', 'additionalProperties'],
      array: ['items', 'minItems', 'maxItems'],
      string: ['minLength', 'maxLength'],
      number: ['minimum', 'maximum'],
      integer: ['minimum', 'maximum']
    };
    for (const key of ['properties', 'required', 'additionalProperties',
      'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum']) {
      if (node[key] !== undefined && !(typeKeywords[node.type] || []).includes(key)) {
        throw new Error('unsupported_schema_keyword_type');
      }
    }
    if (node.properties !== undefined) {
      if (node.properties === null || typeof node.properties !== 'object' ||
          Array.isArray(node.properties) || Object.keys(node.properties).length > 64) {
        throw new Error('unsupported_schema');
      }
      for (const [key, child] of Object.entries(node.properties)) {
        if (key.length > 128) throw new Error('unsupported_schema');
        inspect(child, depth + 1);
      }
    }
    if (node.items !== undefined) inspect(node.items, depth + 1);
    if (node.required !== undefined) {
      if (!Array.isArray(node.required) || node.required.length > 64 ||
          node.required.some(key => typeof key !== 'string' || key.length > 128) ||
          new Set(node.required).size !== node.required.length) throw new Error('unsupported_schema');
    }
    if (node.additionalProperties !== undefined && typeof node.additionalProperties !== 'boolean') {
      throw new Error('unsupported_schema');
    }
    for (const name of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
      if (node[name] !== undefined && !requireBound(node[name])) throw new Error('unsupported_schema');
    }
    for (const name of ['minimum', 'maximum']) {
      if (node[name] !== undefined &&
          (typeof node[name] !== 'number' || !Number.isFinite(node[name]))) {
        throw new Error('unsupported_schema');
      }
    }
    for (const [lo, hi] of [['minLength', 'maxLength'], ['minItems', 'maxItems'],
      ['minimum', 'maximum']]) {
      if (node[lo] !== undefined && node[hi] !== undefined && node[lo] > node[hi]) {
        throw new Error('unsupported_schema');
      }
    }
    if (node.enum !== undefined) {
      if (!Array.isArray(node.enum) || node.enum.length < 1 || node.enum.length > 32 ||
          node.enum.some(value => {
            try { return JSON.stringify(value) === undefined; } catch { return true; }
          })) throw new Error('unsupported_schema');
    }
  }
  inspect(schema, 0);
  return true;
}

function validateSchemaValue(value, schema) {
  validateSchemaDefinition(schema);
  let visited = 0;
  function check(v, s, depth) {
    if (++visited > MAX_NODES || depth > MAX_DEPTH || !s || typeof s !== 'object' ||
        Array.isArray(s)) throw new Error('unsupported_schema');
    for (const key of Object.keys(s)) {
      if (!KEYWORDS.has(key)) throw new Error('unsupported_schema_keyword');
    }
    if (!TYPES.has(s.type)) throw new Error('unsupported_schema_type');
    const typeOk = ({
      object: () => v !== null && typeof v === 'object' && !Array.isArray(v),
      array: () => Array.isArray(v), string: () => typeof v === 'string',
      number: () => typeof v === 'number' && Number.isFinite(v),
      integer: () => Number.isSafeInteger(v), boolean: () => typeof v === 'boolean',
      null: () => v === null
    })[s.type]();
    if (!typeOk) throw new Error('schema_type_mismatch');
    if (s.enum !== undefined) {
      if (!Array.isArray(s.enum) || s.enum.length > 32 ||
          !s.enum.some(item => JSON.stringify(item) === JSON.stringify(v))) {
        throw new Error('schema_enum_mismatch');
      }
    }
    if (s.type === 'object') {
      if (s.properties !== undefined && (!s.properties || typeof s.properties !== 'object' ||
          Array.isArray(s.properties))) throw new Error('unsupported_schema');
      if (s.required !== undefined && (!Array.isArray(s.required) ||
          s.required.some(key => typeof key !== 'string'))) throw new Error('unsupported_schema');
      if (s.additionalProperties !== undefined && typeof s.additionalProperties !== 'boolean') {
        throw new Error('unsupported_schema');
      }
      for (const key of s.required || []) {
        if (!Object.prototype.hasOwnProperty.call(v, key)) throw new Error('schema_required_missing');
      }
      for (const [key, item] of Object.entries(v)) {
        if (Object.prototype.hasOwnProperty.call(s.properties || {}, key)) {
          check(item, s.properties[key], depth + 1);
        } else if (s.additionalProperties === false) throw new Error('schema_extra_property');
      }
    }
    if (s.type === 'array') {
      if (s.items !== undefined && (!s.items || typeof s.items !== 'object' ||
          Array.isArray(s.items))) throw new Error('unsupported_schema');
      if (s.minItems !== undefined && (!Number.isSafeInteger(s.minItems) || s.minItems < 0)) {
        throw new Error('unsupported_schema');
      }
      if (s.maxItems !== undefined && (!Number.isSafeInteger(s.maxItems) || s.maxItems < 0)) {
        throw new Error('unsupported_schema');
      }
      if (v.length < (s.minItems || 0) || (s.maxItems !== undefined && v.length > s.maxItems)) {
        throw new Error('schema_array_bounds');
      }
      if (s.items) for (const item of v) check(item, s.items, depth + 1);
    }
    if (s.type === 'string') {
      if (s.minLength !== undefined && (!Number.isSafeInteger(s.minLength) || s.minLength < 0)) {
        throw new Error('unsupported_schema');
      }
      if (s.maxLength !== undefined && (!Number.isSafeInteger(s.maxLength) || s.maxLength < 0)) {
        throw new Error('unsupported_schema');
      }
      const length = [...v].length;
      if (length < (s.minLength || 0) || (s.maxLength !== undefined && length > s.maxLength)) {
        throw new Error('schema_string_bounds');
      }
    }
    if (s.type === 'integer' || s.type === 'number') {
      if (s.minimum !== undefined && (typeof s.minimum !== 'number' || !Number.isFinite(s.minimum))) {
        throw new Error('unsupported_schema');
      }
      if (s.maximum !== undefined && (typeof s.maximum !== 'number' || !Number.isFinite(s.maximum))) {
        throw new Error('unsupported_schema');
      }
      if ((s.minimum !== undefined && v < s.minimum) ||
          (s.maximum !== undefined && v > s.maximum)) throw new Error('schema_number_bounds');
    }
  }
  check(value, schema, 0);
  return true;
}

const exported = { validateSchemaValue, validateSchemaDefinition };
if (typeof module !== 'undefined' && module.exports) module.exports = exported;
else globalThis.WebMcpSchema = exported;
