(function () {
  const storageKey = 'cajero_config';
  const defaults = {
    atmWidth: 1080,
    atmHeight: 720,
    videoWidth: 850,
    videoHeight: 360,
    sideColumnWidth: 38,
    buttonGap: 80,
    buttonTopMargin: 0,
    buttonFontSize: 16,
    buttonHeight: 48,
    contentTextFontSize: 16,
    amountFontSize: 36,
    inactivitySeconds: 60,
    processCarouselIntervalSeconds: 6,
    participantsCarouselIntervalSeconds: 3,
    carouselPauseSeconds: 10,
    carouselInactivitySeconds: 60,
    processCarouselWidth: 100,
    processCarouselHeight: 330,
    participantsCarouselWidth: 100,
    participantsCarouselHeight: 280
  };
  const limits = {
    atmWidth: [640, 1920],
    atmHeight: [480, 1200],
    videoWidth: [300, 1600],
    videoHeight: [150, 900],
    sideColumnWidth: [15, 45],
    buttonGap: [0, 300],
    buttonTopMargin: [0, 300],
    buttonFontSize: [12, 40],
    buttonHeight: [40, 100],
    contentTextFontSize: [12, 40],
    amountFontSize: [16, 60],
    inactivitySeconds: [5, 600],
    processCarouselIntervalSeconds: [1, 60],
    participantsCarouselIntervalSeconds: [1, 60],
    carouselPauseSeconds: [0, 120],
    carouselInactivitySeconds: [5, 600],
    processCarouselWidth: [30, 100],
    processCarouselHeight: [150, 700],
    participantsCarouselWidth: [30, 100],
    participantsCarouselHeight: [150, 700]
  };

  function normalizeConfig(values) {
    const source = values && typeof values === 'object' ? values : {};
    const config = {};
    Object.keys(defaults).forEach((key) => {
      const legacyWidth = Number(source.carouselWidth);
      const sourceValue = source[key] === undefined &&
        (key === 'processCarouselWidth' || key === 'participantsCarouselWidth') &&
        Number.isFinite(legacyWidth)
        ? legacyWidth
        : source[key];
      const value = Number(sourceValue);
      const [minimum, maximum] = limits[key];
      config[key] = Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value))
        : defaults[key];
    });
    return config;
  }

  function applyConfig(config) {
    const root = document.documentElement;
    root.style.setProperty('--atm-width', config.atmWidth + 'px');
    root.style.setProperty('--atm-height', config.atmHeight + 'px');
    root.style.setProperty('--video-width', config.videoWidth + 'px');
    root.style.setProperty('--video-height', config.videoHeight + 'px');
    root.style.setProperty('--side-column-width', config.sideColumnWidth + '%');
    root.style.setProperty('--button-gap', config.buttonGap + 'px');
    root.style.setProperty('--button-top-margin', config.buttonTopMargin + 'px');
    root.style.setProperty('--button-font-size', config.buttonFontSize + 'px');
    root.style.setProperty('--button-height', config.buttonHeight + 'px');
    root.style.setProperty('--button-row-height', 'max(var(--button-height), calc(var(--button-font-size) + 16px))');
    root.style.setProperty('--content-text-font-size', config.contentTextFontSize + 'px');
    root.style.setProperty('--amount-font-size', config.amountFontSize + 'px');
    root.style.setProperty('--process-carousel-width', config.processCarouselWidth + '%');
    root.style.setProperty('--process-carousel-height', config.processCarouselHeight + 'px');
    root.style.setProperty('--participants-carousel-width', config.participantsCarouselWidth + '%');
    root.style.setProperty('--participants-carousel-height', config.participantsCarouselHeight + 'px');
    applyButtonStartPosition(config);
  }

  function applyButtonStartPosition(config) {
    const container = document.querySelector('.atm-container');
    const header = container && container.querySelector('.header');
    if (!container || !header) return;

    const containerTop = container.getBoundingClientRect().top;
    const headerBottom = header.getBoundingClientRect().bottom;
    const borderTop = parseFloat(getComputedStyle(container).borderTopWidth) || 0;
    document.documentElement.style.setProperty(
      '--button-start-y',
      headerBottom - containerTop - borderTop + config.buttonTopMargin + 'px'
    );
  }

  window.getCajeroConfig = function () {
    let stored = {};
    try {
      const raw = localStorage.getItem(storageKey);
      stored = raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.error('No se pudo leer la configuración del cajero.', error);
    }

    const config = normalizeConfig(stored);
    applyConfig(config);
    return config;
  };

  window.saveCajeroConfig = function (values) {
    const config = normalizeConfig(values);
    localStorage.setItem(storageKey, JSON.stringify(config));
    applyConfig(config);
    return config;
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.getCajeroConfig();
  });
  window.addEventListener('resize', function () {
    window.getCajeroConfig();
  });

  window.getCajeroConfig();
})();
