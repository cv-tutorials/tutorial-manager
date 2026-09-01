/**
 * SCORM 1.2 API Wrapper — endurecido
 * Coaches' Voice — CV SCORM Builder (template de presentaciones)
 *
 * Reutilizable tal cual. No reescribir la lógica de sesión.
 * Incluye:
 *  - búsqueda de la API subiendo por window.parent (y window.opener)
 *  - finish() idempotente con guard _terminated
 *  - setValue/getValue/commit se vuelven no-ops tras terminar
 *  - clearSuspendData / getSuspendData / setSuspendData
 */
var ScormAPI = (function () {
  var _api = null;
  var _initialized = false;
  var _terminated = false;

  function _findAPI(win) {
    var attempts = 0;
    while (win.API == null && win.parent != null && win.parent != win) {
      attempts++;
      if (attempts > 7) return null;
      win = win.parent;
    }
    return win.API;
  }

  function _getAPI() {
    if (_api) return _api;
    _api = _findAPI(window);
    if (!_api && window.opener) _api = _findAPI(window.opener);
    return _api;
  }

  function initialize() {
    if (_terminated) return false;
    var api = _getAPI();
    if (!api) { console.warn("SCORM API not found — running in standalone mode"); return false; }
    var result = api.LMSInitialize("");
    _initialized = result === "true" || result === true;
    return _initialized;
  }

  function setValue(element, value) {
    if (_terminated) return false;
    var api = _getAPI();
    if (!api || !_initialized) return false;
    return api.LMSSetValue(element, String(value));
  }

  function getValue(element) {
    if (_terminated) return "";
    var api = _getAPI();
    if (!api || !_initialized) return "";
    return api.LMSGetValue(element);
  }

  function commit() {
    if (_terminated) return false;
    var api = _getAPI();
    if (!api || !_initialized) return false;
    return api.LMSCommit("");
  }

  function finish() {
    if (_terminated) return false;           // idempotente: nunca cierra dos veces
    var api = _getAPI();
    if (!api || !_initialized) { _terminated = true; return false; }
    _terminated = true;
    return api.LMSFinish("");
  }

  function setScore(raw, min, max) {
    setValue("cmi.core.score.raw", raw);
    setValue("cmi.core.score.min", min == null ? 0 : min);
    setValue("cmi.core.score.max", max == null ? 100 : max);
  }

  function setStatus(status) {
    // Válidos: "passed","failed","completed","incomplete","not attempted","browsed"
    setValue("cmi.core.lesson_status", status);
  }

  function setSuspendData(data) {
    setValue("cmi.suspend_data", JSON.stringify(data));
  }

  function getSuspendData() {
    try {
      var raw = getValue("cmi.suspend_data");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearSuspendData() {
    setValue("cmi.suspend_data", "");
  }

  function isTerminated() { return _terminated; }

  return {
    initialize: initialize, setValue: setValue, getValue: getValue, commit: commit,
    finish: finish, setScore: setScore, setStatus: setStatus,
    setSuspendData: setSuspendData, getSuspendData: getSuspendData,
    clearSuspendData: clearSuspendData, isTerminated: isTerminated
  };
})();
