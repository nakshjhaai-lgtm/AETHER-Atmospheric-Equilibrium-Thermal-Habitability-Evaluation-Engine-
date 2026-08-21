// js/ui/dom.js — Shared DOM helpers.
// Single source of truth for `$` (querySelector) and `$$` (querySelectorAll) so
// modules that need them import from here instead of re-declaring or relying on
// a global that may not be in scope in an ES module.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
