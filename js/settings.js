import { getApiKeys, setApiKeys, bindModalDialogDismiss, closeTopLayer } from './utils.js';

export class SettingsPanel {
  constructor() {
    this.dialog = document.getElementById('settings-dialog');
    this._init();
  }
  
  _init() {
    // Close buttons (both X icon and Cancel button)
    this.dialog?.querySelectorAll('.settings__close').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });
    
    // Save button
    this.dialog?.querySelector('.settings__save')?.addEventListener('click', () => this.save());

    // Clear buttons (two-click inline confirmation — non-blocking)
    this.dialog?.querySelectorAll('.settings__clear-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        this.clearKey(targetId, btn);
      });
    });
    
    // Toggle password visibility for API key inputs
    this.dialog?.querySelectorAll('.settings__toggle-vis').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          btn.textContent = isPassword ? '🙈' : '👁️';
          btn.setAttribute('aria-pressed', String(isPassword));
        }
      });
    });

    // Provider selector — show/hide relevant API key fields
    const providerSelect = this.dialog?.querySelector('#api-provider');
    providerSelect?.addEventListener('change', () => this._updateProviderFields());

    // Bind modern modal dismiss, Esc transition, and returnValue cleanup
    if (this.dialog) {
      bindModalDialogDismiss(this.dialog);
    }
  }

  _updateProviderFields() {
    const provider = this.dialog?.querySelector('#api-provider')?.value || 'gemini';
    const geminiGroup = this.dialog?.querySelector('#gemini-group');
    const geminiModelGroup = this.dialog?.querySelector('#gemini-model-group');
    const openaiGroup = this.dialog?.querySelector('#openai-group');

    if (geminiGroup) geminiGroup.style.display = provider === 'gemini' ? '' : 'none';
    if (geminiModelGroup) geminiModelGroup.style.display = provider === 'gemini' ? '' : 'none';
    if (openaiGroup) openaiGroup.style.display = provider === 'openai' ? '' : 'none';
  }

  clearKey(targetId, btn) {
    const input = this.dialog?.querySelector(`#${targetId}`);
    if (!input || !input.value) return;

    if (btn && btn.dataset.confirming !== 'true') {
      btn.dataset.confirming = 'true';
      btn.textContent = 'Confirm';
      btn.classList.add('settings__clear-key--confirm');
      clearTimeout(btn._confirmTimer);
      btn._confirmTimer = setTimeout(() => {
        btn.dataset.confirming = 'false';
        btn.textContent = '🗑️';
        btn.classList.remove('settings__clear-key--confirm');
      }, 3000);
      return;
    }

    if (btn) {
      clearTimeout(btn._confirmTimer);
      btn.dataset.confirming = 'false';
      btn.textContent = '🗑️';
      btn.classList.remove('settings__clear-key--confirm');
    }
    input.value = '';
    this._saveKeys();
  }

  /** Shared save logic used by both save() and clearKey() */
  _saveKeys() {
    const gemini = this.dialog?.querySelector('#gemini-key')?.value?.trim() || '';
    const openai = this.dialog?.querySelector('#openai-key')?.value?.trim() || '';
    const openweather = this.dialog?.querySelector('#weather-key')?.value?.trim() || '';
    const unsplash = this.dialog?.querySelector('#unsplash-key')?.value?.trim() || '';
    const model = this.dialog?.querySelector('#gemini-model')?.value || 'gemini-3.5-flash';
    const provider = this.dialog?.querySelector('#api-provider')?.value || 'gemini';
    const jarvisVoice = this.dialog?.querySelector('#jarvis-voice-toggle')?.value || 'enabled';
    const jarvisSfx = this.dialog?.querySelector('#jarvis-sfx-toggle')?.value || 'enabled';
    
    setApiKeys({ gemini, openai, openweather, unsplash, model, provider, jarvisVoice, jarvisSfx });
    
    // Dispatch custom event so app knows keys changed
    window.dispatchEvent(new CustomEvent('settings-changed'));
  }
  
  open() {
    // Load current keys into inputs
    const keys = getApiKeys();
    const inputs = {
      'gemini-key': keys.gemini || '',
      'openai-key': keys.openai || '',
      'weather-key': keys.openweather || '',
      'unsplash-key': keys.unsplash || '',
    };
    
    for (const [id, val] of Object.entries(inputs)) {
      const el = this.dialog?.querySelector(`#${id}`);
      if (el) el.value = val;
    }

    const modelSelect = this.dialog?.querySelector('#gemini-model');
    if (modelSelect) modelSelect.value = keys.model || 'gemini-3.5-flash';

    const providerSelect = this.dialog?.querySelector('#api-provider');
    if (providerSelect) providerSelect.value = keys.provider || 'gemini';

    const voiceSelect = this.dialog?.querySelector('#jarvis-voice-toggle');
    if (voiceSelect) voiceSelect.value = keys.jarvisVoice || 'enabled';

    const sfxSelect = this.dialog?.querySelector('#jarvis-sfx-toggle');
    if (sfxSelect) sfxSelect.value = keys.jarvisSfx || 'enabled';

    this._updateProviderFields();
    this.dialog?.showModal();
  }
  
  save() {
    this._saveKeys();
    this.close();
  }
  
  close() {
    if (this.dialog) closeTopLayer(this.dialog);
  }
  
  // Check if minimum required keys are set for the selected provider
  hasRequiredKeys() {
    const keys = getApiKeys();
    const provider = keys.provider || 'gemini';
    if (provider === 'openai') return !!(keys.openai);
    return !!(keys.gemini);
  }
}
