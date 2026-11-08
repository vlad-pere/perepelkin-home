import { bootFromCache } from './appearance';

// Синхронно до основного бандла: применяем сохранённую тему из localStorage,
// чтобы сплэш-экран и логин не мигали дефолтными цветами.
bootFromCache();
