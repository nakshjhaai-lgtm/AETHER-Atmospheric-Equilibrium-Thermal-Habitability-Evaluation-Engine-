// tests/unit/test-shader-engine.test.js — Proves ShaderEngine interactionSurface binding
import { describe, it, expect } from 'vitest';
import { ShaderEngine } from '../../js/shader-engine.js';

describe('ShaderEngine interactionSurface binding', () => {
  it('accepts and stores an interactionSurface in the constructor', () => {
    const fakeContainer = {};
    const fakeSurface = {};
    const engine = new ShaderEngine(fakeContainer, fakeSurface);

    expect(engine.container).toBe(fakeContainer);
    expect(engine.interactionSurface).toBe(fakeSurface);
  });

  it('binds orbit controls to interactionSurface when provided', () => {
    const listeners = {};
    const fakeSurface = {
      addEventListener(event, fn) {
        listeners[event] = fn;
      }
    };
    const engine = new ShaderEngine({}, fakeSurface);
    // Mock renderer so bindOrbitControls does not fail
    engine.renderer = {
      domElement: {
        addEventListener() {}
      }
    };

    engine.bindOrbitControls();

    expect(typeof listeners.pointerdown).toBe('function');
    expect(typeof listeners.wheel).toBe('function');
  });
});
