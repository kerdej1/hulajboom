'use strict';

/* =====================================================================
   Planner studenta
   ---------------------------------------------------------------------
   Każde zadanie oceniamy na dwóch osiach:
   1. WAŻNOŚĆ – pole "priorytet" z pliku JSON (niski / sredni / wysoki),
   2. INTENSYWNOŚĆ (5 poziomów) – ile potrzebnego czasu pracy zostało do terminu.
   Na tej podstawie aplikacja:
   - rozkłada dni pracy przed terminem (tyle, ile wynosi szacowany czas pracy),
   - pokazuje wszystko w terminarzu (tydzień / 2 tygodnie / miesiąc).
   Zadania okresowe (siłownia, zakupy...) i pojedyncze akcje 🛴 (np. zakup pralki)
   nie mają priorytetu ani dni pracy.
   Format pliku JSON pozostaje nietknięty – dodatkowe informacje (czas pracy,
   zadanie okresowe, pojedyncza akcja) zapisujemy jako ukryte tagi, np. "⏱30d", "okresowe", "akcja".
   ===================================================================== */

// ---------- Ustawienia ----------
const KLUCZ_DANE = 'planner.dane.v2';     // zadania (ten sam format co plik JSON)
const KLUCZ_SESJE = 'planner.sesje.v2';   // odhaczone dni pracy: { idZadania: [daty] }
const KLUCZ_WOLNE = 'planner.wolne.v2';
const KLUCZ_PROFIL = 'planner.profil.v2';   // styl pracy użytkownika: { styl, punkty }   // wykreślone dni (wakacje, wyjazd...): { data: powód }

const PRIORYTETY = ['niski', 'sredni', 'wysoki'];
const NAZWA_PRIORYTETU = { niski: 'Niski', sredni: 'Średni', wysoki: 'Wysoki' };
const WAGA_PRIORYTETU = { niski: 1, sredni: 2, wysoki: 3 };

// Szacowany czas pracy (w dniach), gdy użytkownik go nie podał – zależnie od ważności
const DOMYSLNY_CZAS = { wysoki: 3, sredni: 2, niski: 1 };
const ZNAK_WAZNOSCI = { wysoki: '!!!', sredni: '!!', niski: '!' };

// 5 poziomów intensywności. Liczymy, jaka część potrzebnego czasu pracy (x) została do terminu.
// Progi ("od") są domyślne: ≥ 100% x → Luz, potem co 23,3 punktu procentowego w dół.
// Użytkownik może je zmienić w panelu "Mój styl pracy" (funkcja progiPoziomow).
const POZIOMY = [
  { klucz: 'luz', nazwa: 'Luz', od: 1.0 },
  { klucz: 'spokojnie', nazwa: 'Spokojnie', od: 0.767 },
  { klucz: 'pora', nazwa: 'Pora zaczynać', od: 0.534 },
  { klucz: 'pilne', nazwa: 'Pilne', od: 0.301 },
  { klucz: 'krytyczne', nazwa: 'Krytyczne', od: -Infinity },
];
const NAZWA_POZIOMU = Object.fromEntries(POZIOMY.map(p => [p.klucz, p.nazwa]));
NAZWA_POZIOMU.okresowe = 'Okresowe';
NAZWA_POZIOMU.akcja = 'Pojedyncza akcja';

// Ukryte tagi – tak zapisujemy w JSON informacje, dla których format nie ma pól
const TAG_OKRESOWE = 'okresowe';         // zadanie okresowe (siłownia, zakupy...) – bez priorytetu
const TAG_AKCJA = 'akcja';               // pojedyncza akcja (np. zakup pralki) – bez priorytetu i czasu, ikonka 🛴
const ZNAK_CZASU = '⏱';                   // np. tag "⏱30d" = szacowany czas pracy 30 dni

// ---------- Stan aplikacji ----------
let dane = { wersja: 1, zadania: [] };
let sesje = {};
let wolne = {};          // dni wykreślone – nie liczą się do czasu na pracę
let widok = 'terminarz';   // widok startowy: kalendarz
const filtry = { szukaj: '', tag: '', grupuj: 'poziom', pokazZrobione: false };
let szczegolyId = null;   // zadanie otwarte w oknie szczegółów
let edytowaneId = null;

// "Dziś" można nadpisać do testów/prezentacji: index.html?dzis=2026-11-20
const DZIS = (() => {
  const z = new URLSearchParams(location.search).get('dzis');
  return z && poprawnaData(z) ? z : naISO(new Date());
})();

/* =====================================================================
   Daty – zawsze jako tekst "RRRR-MM-DD" (taki jak w pliku JSON)
   ===================================================================== */
function naISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function zISO(s) {
  const [r, m, d] = s.split('-').map(Number);
  return new Date(r, m - 1, d);
}
function poprawnaData(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && naISO(zISO(s)) === s;
}
function dodajDni(s, n) {
  const d = zISO(s);
  d.setDate(d.getDate() + n);
  return naISO(d);
}
/** Ile dni od daty a do daty b (b - a). */
function roznicaDni(a, b) {
  const [r1, m1, d1] = a.split('-').map(Number);
  const [r2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(r2, m2 - 1, d2) - Date.UTC(r1, m1 - 1, d1)) / 86400000);
}
function ladnaData(s, zDniem = true) {
  const opcje = zDniem ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' };
  return zISO(s).toLocaleDateString('pl-PL', opcje);
}
/** Lista dat dni pracy – długie plany skracamy, żeby nie zalały okna. */
function listaDniPracy(plan, max = 8) {
  const dni = plan.map(s => s.data === DZIS ? 'dziś' : ladnaData(s.data));
  // kilka bloków w jednym dniu pokazujemy jako "pon., 23 lis ×2"
  const zgrupowane = [];
  for (const d of dni) {
    const ost = zgrupowane[zgrupowane.length - 1];
    if (ost && ost.d === d) ost.n++; else zgrupowane.push({ d, n: 1 });
  }
  const teksty = zgrupowane.map(x => x.n > 1 ? `${x.d} ×${x.n}` : x.d);
  return teksty.length > max ? teksty.slice(0, max).join(' · ') + ` · … (+${teksty.length - max} dni)` : teksty.join(' · ');
}
function formatDni(n) {
  const t = String(Math.round(n * 10) / 10).replace('.', ',');
  return n === 1 ? '1 dzień' : `${t} dni`;
}
function opisTerminu(termin) {
  if (!termin) return 'bez terminu';
  const d = roznicaDni(DZIS, termin);
  if (d === 0) return 'dziś';
  if (d === 1) return 'jutro';
  if (d === -1) return 'wczoraj (po terminie)';
  if (d < 0) return `${-d} dni po terminie`;
  return `za ${d} dni · ${ladnaData(termin)}`;
}

/* =====================================================================
   Wczytywanie i sprawdzanie pliku JSON
   ===================================================================== */

/** Ustawia pola zadania w tej samej kolejności co w oryginalnym pliku.
    Nieznane pola (gdyby były w pliku) zostają zachowane na końcu. */
function uporzadkuj(z) {
  const { id, tytul, opis, termin, priorytet, wykonane, tagi, ...reszta } = z;
  return { id, tytul, opis, termin, priorytet, wykonane, tagi, ...reszta };
}

/** Sprawdza i naprawia dane z pliku. Zwraca { dane, ostrzezenia }. */
function normalizuj(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.zadania)) {
    throw new Error('W pliku brakuje listy "zadania".');
  }
  const ostrzezenia = [];
  const wersja = obj.wersja === undefined ? 1 : obj.wersja;
  if (wersja !== 1) ostrzezenia.push(`Nieznana wersja pliku (${wersja}) – próbuję wczytać mimo to.`);

  let maxId = 0;
  for (const z of obj.zadania) if (z && Number.isInteger(z.id)) maxId = Math.max(maxId, z.id);

  const uzyteId = new Set();
  const zadania = [];
  obj.zadania.forEach((z, i) => {
    const nr = i + 1;
    if (!z || typeof z !== 'object' || Array.isArray(z)) {
      ostrzezenia.push(`Pozycja ${nr} pominięta – to nie jest zadanie.`);
      return;
    }
    const t = { ...z };

    if (!Number.isInteger(z.id) || uzyteId.has(z.id)) {
      t.id = ++maxId;
      ostrzezenia.push(`Zadanie ${nr}: brak lub powtórzone id – nadano id ${t.id}.`);
    }
    uzyteId.add(t.id);

    if (typeof z.tytul !== 'string' || !z.tytul.trim()) {
      t.tytul = '(bez tytułu)';
      ostrzezenia.push(`Zadanie ${nr}: brak tytułu.`);
    }
    t.opis = typeof z.opis === 'string' ? z.opis : '';

    if (z.termin === null || z.termin === undefined || z.termin === '') {
      t.termin = null;
    } else if (!poprawnaData(z.termin)) {
      ostrzezenia.push(`Zadanie ${nr}: niepoprawny termin "${z.termin}" – ustawiono brak terminu.`);
      t.termin = null;
    }

    if (!PRIORYTETY.includes(z.priorytet)) {
      ostrzezenia.push(`Zadanie ${nr}: nieznany priorytet "${z.priorytet}" – ustawiono "sredni".`);
      t.priorytet = 'sredni';
    }

    t.wykonane = z.wykonane === true;
    t.tagi = Array.isArray(z.tagi)
      ? z.tagi.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
      : [];

    zadania.push(uporzadkuj(t));
  });

  const { wersja: _w, zadania: _z, ...resztaPliku } = obj;
  return { dane: { wersja, zadania, ...resztaPliku }, ostrzezenia };
}

function wczytajZPliku(plik) {
  const czytnik = new FileReader();
  czytnik.onload = () => {
    let wynik;
    try {
      wynik = normalizuj(JSON.parse(czytnik.result));
    } catch (e) {
      powiadom(`Nie udało się wczytać pliku: ${e.message}`);
      return;
    }
    const poprzednie = { dane, sesje };
    // odhaczone sesje zostawiamy tylko dla zadań, które w nowym pliku mają to samo id i ten sam tytuł
    // (np. gdy wczytujesz z powrotem plik, który sam zapisałeś); reszta nie pasuje do nowych zadań
    const stareTytuly = Object.fromEntries(dane.zadania.map(z => [z.id, z.tytul]));
    dane = wynik.dane;
    sesje = Object.fromEntries(Object.entries(sesje).filter(([id]) =>
      dane.zadania.some(z => String(z.id) === id && z.tytul === stareTytuly[id])));
    zapiszLokalnie();
    odswiez();
    let tekst = `Wczytano ${dane.zadania.length} zadań z pliku „${plik.name}”.`;
    if (wynik.ostrzezenia.length) {
      tekst += ` Poprawiono ${wynik.ostrzezenia.length} problem(ów) – szczegóły w konsoli.`;
      console.warn('Ostrzeżenia przy wczytywaniu:\n' + wynik.ostrzezenia.join('\n'));
    }
    powiadom(tekst, 'Cofnij', () => {
      dane = poprzednie.dane;
      sesje = poprzednie.sesje;
      zapiszLokalnie();
      odswiez();
    });
  };
  czytnik.onerror = () => powiadom('Nie udało się odczytać pliku.');
  czytnik.readAsText(plik, 'utf-8');
}

/** Zapis do pliku – dokładnie ten sam format: { "wersja": 1, "zadania": [...] } */
function zapiszDoPliku() {
  const tekst = JSON.stringify({ ...dane, zadania: dane.zadania.map(uporzadkuj) }, null, 2);
  const blob = new Blob([tekst + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'zadania.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  powiadom(`Zapisano ${dane.zadania.length} zadań do pliku zadania.json.`);
}

/* ---------- Autozapis w przeglądarce ---------- */
function zapiszLokalnie() {
  try {
    localStorage.setItem(KLUCZ_DANE, JSON.stringify(dane));
    localStorage.setItem(KLUCZ_SESJE, JSON.stringify(sesje));
    localStorage.setItem(KLUCZ_WOLNE, JSON.stringify(wolne));
    if (profil) localStorage.setItem(KLUCZ_PROFIL, JSON.stringify(profil));
  } catch (e) { /* np. tryb prywatny – aplikacja działa dalej, tylko bez autozapisu */ }
}
function wczytajLokalnie() {
  try {
    const pr = JSON.parse(localStorage.getItem(KLUCZ_PROFIL) || 'null');
    profil = pr && poprawnePunkty(pr.punkty) ? pr : null;
  } catch (e) { profil = null; }
  try {
    const w = JSON.parse(localStorage.getItem(KLUCZ_WOLNE) || '{}');
    wolne = w && typeof w === 'object' && !Array.isArray(w) ? w : {};
  } catch (e) { wolne = {}; }
  try {
    const d = localStorage.getItem(KLUCZ_DANE);
    if (d) {
      dane = normalizuj(JSON.parse(d)).dane;
      const s = JSON.parse(localStorage.getItem(KLUCZ_SESJE) || '{}');
      sesje = s && typeof s === 'object' ? s : {};
      return true;
    }
  } catch (e) { /* uszkodzone dane – zaczynamy od przykładu */ }
  return false;
}

/* =====================================================================
   SMART: czas pracy, 5 poziomów intensywności, plan dni pracy, obciążenie
   ---------------------------------------------------------------------
   Każde zadanie ma szacowany czas pracy x (w dniach) – tyle, ile trzeba,
   żeby zrobić je SPOKOJNIE. Porównujemy go z czasem do terminu:
       wskaźnik = dni do terminu ÷ pozostała praca
   ≥ 1,0   → Luz (czasu jest tyle, ile trzeba, albo więcej)
   ≥ 0,767 → Spokojnie
   ≥ 0,534 → Pora zaczynać
   ≥ 0,301 → Pilne
   mniej   → Krytyczne (także po terminie)
   Odhaczone dni pracy zmniejszają pozostałą pracę, więc gdy pracujesz
   na bieżąco, poziom się nie pogarsza.
   ===================================================================== */

/* ---------- Ukryte tagi ---------- */
function czyOkresowe(z) { return z.tagi.includes(TAG_OKRESOWE); }
function czyAkcja(z) { return z.tagi.includes(TAG_AKCJA); }
/** Zadania bez priorytetu i bez planowania: okresowe i pojedyncze akcje. */
function czyBezPlanu(z) { return czyOkresowe(z) || czyAkcja(z); }
function rodzaj(z) { return czyAkcja(z) ? 'akcja' : czyOkresowe(z) ? 'okresowe' : 'zwykle'; }
function czyTagUkryty(t) { return t === TAG_OKRESOWE || t === TAG_AKCJA || t.startsWith(ZNAK_CZASU); }
function widoczneTagi(z) { return z.tagi.filter(t => !czyTagUkryty(t)); }
function czasZTagu(z) {
  for (const t of z.tagi) {
    const m = /^⏱\s*(\d+(?:[.,]\d+)?)\s*d$/.exec(t);
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (v > 0) return v; }
  }
  return null;
}
function tagCzasu(dni) { return `${ZNAK_CZASU}${dni}d`; }

/* ---------- Dni wykreślone ---------- */
function czyWolny(data) { return Object.prototype.hasOwnProperty.call(wolne, data); }
/** Dni (jako przesunięcia od dziś) od..do włącznie, bez dni wykreślonych. */
function dniRobocze(od, doDnia) {
  const wynik = [];
  for (let o = od; o <= doDnia; o++) if (!czyWolny(dodajDni(DZIS, o))) wynik.push(o);
  return wynik;
}
/** Ile dni do terminu można realnie przeznaczyć na pracę (bez wykreślonych). */
function dniNaPrace(z) {
  if (!z.termin) return Infinity;
  const doTerminu = roznicaDni(DZIS, z.termin);
  return doTerminu <= 0 ? 0 : dniRobocze(0, doTerminu - 1).length;
}

/** Szacowany czas pracy w dniach (podany przez użytkownika albo domyślny). */
function szacowanyCzas(z) {
  if (czyPowtorka(z)) return 1;   // powtórka ma swoją długość w godzinach, intensywność liczymy jak dla 1 dnia
  const dni = czasZTagu(z);
  if (dni !== null) return dni;
  const godz = godzinyZTagu(z);   // podano tylko godziny → dni wyliczamy z krzywej użytkownika
  if (godz !== null) return Math.max(0.25, dniZGodzin(godz));
  return DOMYSLNY_CZAS[z.priorytet] || 1;
}
/** Godziny czystej pracy wpisane ręcznie (ukryty tag "⏱12h"); null = liczone automatycznie. */
function godzinyZTagu(z) {
  if (czyPowtorka(z)) return null;
  for (const t of z.tagi) {
    const m = /^⏱\s*(\d+(?:[.,]\d+)?)\s*h$/.exec(t);
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (v > 0) return v; }
  }
  return null;
}

/* ---------- Godziny pracy (dopasowane do użytkownika) ----------
   Szacowany czas x (dni) = ile dni potrzeba, żeby zrobić zadanie SPOKOJNIE.
   Ile to godzin czystej pracy – zależy od człowieka. Przy pierwszym wejściu
   pytamy o styl pracy i dajemy do wyboru tabelki z trzema punktami:
   ile godzin to 1 dzień, 3 dni i 30 dni. Przez te punkty prowadzimy krzywą
   (odcinkami prostymi w skali logarytmicznej, czyli kawałkami krzywej potęgowej):
   przechodzi dokładnie przez wybrane wartości, a poza nimi zachowuje nachylenie.
   Dzięki temu krótkie zadania mogą być "gęstsze" niż długie – albo odwrotnie. */
const SESJA_SPOKOJNA_H = 3;          // długość sesji przy spokojnym tempie
const ODSTEP_SPOKOJNY = 2.4;         // co ile dni sesja przy spokojnym tempie
const PUNKTY_DNI = [1, 3, 30];
const DOMYSLNE_PUNKTY = [3.5, 7.5, 37.5];   // zanim użytkownik wybierze swój styl
let profil = null;                           // { styl, punkty: [h1, h3, h30] }

function punktyProfilu() {
  return profil && Array.isArray(profil.punkty) ? profil.punkty : DOMYSLNE_PUNKTY;
}
function interpolujLog(v, X, Y) {
  const lv = Math.log(v);
  const lx = X.map(Math.log), ly = Y.map(Math.log);
  const i = lv <= lx[1] ? 0 : 1;
  const t = (lv - lx[i]) / (lx[i + 1] - lx[i]);
  return Math.exp(ly[i] + t * (ly[i + 1] - ly[i]));
}
/** Szacowany czas (dni spokojnego planu) → godziny czystej pracy. */
function godzinyZDni(x) { return x > 0 ? interpolujLog(x, PUNKTY_DNI, punktyProfilu()) : 0; }
/** Odwrotnie: godziny pracy → ile dni spokojnego planu to odpowiada. */
function dniZGodzin(h) { return h > 0 ? interpolujLog(h, punktyProfilu(), PUNKTY_DNI) : 0; }

// Limity oparte na badaniach:
// – Ericsson, Krampe i Tesch-Römer (1993): przy wymagającej pracy umysłowej korzyści maleją
//   powyżej ok. 2 h, a powyżej ok. 4 h dziennie praktycznie znikają → max 4 h dziennie na zadanie.
// – Rawson i Dunlosky (2011, 2022): nauka + 3 spaced powtórki ("successive relearning")
//   zwykle wystarczają do pełnego efektu → przy nauce co najmniej 4 sesje.
// – Mazza i in. (2016): sen między sesjami przyspiesza ponowną naukę i poprawia
//   zapamiętanie → najwyżej jedna sesja dziennie na zadanie.
const MAX_SESJA_H = 4;               // max na jedno zadanie w jednym dniu
const MAX_DZIEN_H = 4;
const NAUKA_SESJA_H = 2;             // przy nauce: sesje do ok. 2 h (powyżej korzyści maleją)
const NAUKA_MIN_SESJI = 4;           // nauka + 3 powtórki
const GODZIN_W_DNIU_POWTORKI = 6;    // "1 dzień" jako jednostka długości powtórki

/** Odhaczone sesje: lista { d: data, h: godziny }. (Stare wpisy to same daty – liczymy je jako 3 h.) */
function wpisySesji(id) {
  const l = Array.isArray(sesje[id]) ? sesje[id] : [];
  return l.map(w => typeof w === 'string' ? { d: w, h: SESJA_SPOKOJNA_H } : w).filter(w => w && poprawnaData(w.d));
}
function zrobioneSesje(id) { return wpisySesji(id).map(w => w.d); }
function godzinyZrobione(id) { return wpisySesji(id).reduce((s, w) => s + (Number(w.h) || 0), 0); }

function godzinyRazem(z) { return godzinyZTagu(z) ?? godzinyZDni(szacowanyCzas(z)); }   // ręcznie wpisane godziny mają pierwszeństwo
function godzinyPozostale(z) { return Math.max(0, godzinyRazem(z) - godzinyZrobione(z.id)); }
/** Pozostała praca wyrażona w dniach spokojnego planu (do liczenia intensywności). */
function pozostalaPraca(z) {
  // ta część szacowanego czasu, która odpowiada jeszcze niezrobionym godzinom
  const razem = godzinyRazem(z);
  return razem > 0 ? szacowanyCzas(z) * godzinyPozostale(z) / razem : 0;
}
/** Jaka część potrzebnej pracy mieści się w czasie do terminu (1 = dokładnie tyle, ile trzeba). */
function wskaznikCzasu(z) {
  if (!z.termin) return Infinity;
  const praca = pozostalaPraca(z);
  if (praca < 0.01) return Infinity;
  if (roznicaDni(DZIS, z.termin) < 0) return -1;
  return dniNaPrace(z) / praca;   // wykreślone dni (np. wakacje) nie liczą się jako czas na pracę
}
/** Poziom intensywności: luz / spokojnie / pora / pilne / krytyczne (albo okresowe). */
function poziom(z) {
  if (czyAkcja(z)) return 'akcja';
  if (czyOkresowe(z)) return 'okresowe';
  const w = wskaznikCzasu(z);
  const progi = progiPoziomow();
  for (let i = 0; i < progi.length; i++) if (w >= progi[i]) return POZIOMY[i].klucz;
  return 'krytyczne';
}
function opisWskaznika(z) {
  const w = wskaznikCzasu(z);
  if (!z.termin) return 'bez terminu';
  if (w === Infinity) return 'praca zrobiona';
  if (w < 0) return 'po terminie';
  return `zostało ${Math.round(w * 100)}% potrzebnego czasu`;
}
function poTerminie(z) {
  return !z.wykonane && z.termin && z.termin < DZIS;
}
function formatGodzin(h) {
  if (h < 1) return `${Math.max(5, Math.round(h * 60 / 5) * 5)} min`;
  const r = Math.round(h * 2) / 2;
  return `${String(r).replace('.', ',')} h`;
}

/* =====================================================================
   KRZYWA ZAPOMINANIA (Ebbinghaus) – do zadań, w których się UCZYMY
   ---------------------------------------------------------------------
   Model: zapamiętanie R = e^(−t/S), t = dni od ostatniej nauki,
   S = stabilność pamięci. Po każdej sesji R wraca do 100%, a S rośnie –
   tym bardziej, im więcej zdążyliśmy zapomnieć (efekt rozłożenia w czasie).
   Sesja dzień po dniu prawie nic nie dodaje, sesja po dłuższej przerwie
   wzmacnia pamięć najmocniej. Dla każdego zadania sprawdzamy wiele
   rozkładów sesji i wybieramy ten, po którym w dniu terminu
   zapamiętasz najwięcej.
   ===================================================================== */
const STABILNOSC_POCZATKOWA = 1.5;   // dni – świeżo nauczony materiał szybko ulatuje
const WZROST_STABILNOSCI = 2.2;      // ile mocniej utrwala sesja po całkowitym zapomnieniu

function czyNauka(z) {
  return czyEgzamin(z) || czyPowtorka(z) || z.tagi.includes('kolokwium')
    || /kolokw|kolos|egzamin|sprawdzian|zaliczeni|\btest\b|nauka|nauczyć|powtórk/i.test(z.tytul);
}

/** Zapamiętanie w dniu `koniec` po sesjach w podanych dniach (posortowanych). */
function zapamietanie(dni, koniec) {
  if (!dni.length) return 0;
  let S = STABILNOSC_POCZATKOWA;
  for (let i = 1; i < dni.length; i++) {
    const R = Math.exp(-(dni[i] - dni[i - 1]) / S);
    S = S * (1 + WZROST_STABILNOSCI * (1 - R));
  }
  return Math.exp(-(koniec - dni[dni.length - 1]) / S);
}

/**
 * Wybiera n dni z listy dostępnych (przesunięcia od dziś), żeby zapamiętanie
 * w dniu `koniec` było jak największe. Sprawdzamy rodzinę rozkładów, w których
 * kolejne przerwy rosną albo maleją geometrycznie (iloraz r), oraz minimalną
 * przerwę `minOdstep` (np. powtórka trwająca 2 dni).
 */
function rozkladEbbinghausa(dostepne, n, koniec, minOdstep = 1) {
  if (n <= 0 || !dostepne.length) return [];
  if (n >= dostepne.length) return dostepne.slice();
  if (n === 1) return [dostepne[dostepne.length - 1]];
  const pierwszy = dostepne[0], ostatni = dostepne[dostepne.length - 1];
  let najlepszy = null, najlepszyWynik = -1;
  for (let r = 0.4; r <= 2.51; r += 0.05) {
    // przerwy g_k ∝ r^k, przeskalowane tak, żeby wypełnić okno
    const wagi = Array.from({ length: n - 1 }, (_, k) => Math.pow(r, k));
    const suma = wagi.reduce((a, b) => a + b, 0);
    const cele = [pierwszy];
    let acc = 0;
    for (const w of wagi) { acc += w; cele.push(pierwszy + (ostatni - pierwszy) * acc / suma); }
    // dopasowanie do najbliższych wolnych dni (każdy dzień najwyżej raz, z minimalną przerwą)
    const wybrane = [];
    let ok = true;
    for (let i = 0; i < cele.length; i++) {
      const pozostale = cele.length - i - 1;
      const kandydaci = dostepne.filter(d =>
        (!wybrane.length || d - wybrane[wybrane.length - 1] >= minOdstep) &&
        dostepne.filter(x => x > d).length >= pozostale);
      if (!kandydaci.length) { ok = false; break; }
      wybrane.push(kandydaci.reduce((a, b) => Math.abs(b - cele[i]) < Math.abs(a - cele[i]) ? b : a));
    }
    if (!ok) continue;
    const wynik = zapamietanie(wybrane, koniec);
    if (wynik > najlepszyWynik + 1e-9) { najlepszyWynik = wynik; najlepszy = wybrane; }
  }
  if (najlepszy) return najlepszy;
  // awaryjnie: równo
  return Array.from({ length: n }, (_, i) => dostepne[Math.round(i * (dostepne.length - 1) / (n - 1))]);
}

/** Równy rozkład (projekty, eseje – tam liczy się postęp, a nie pamięć). */
function rozkladRowny(dostepne, n) {
  if (n >= dostepne.length) return dostepne.slice();
  const dni = [];
  for (let i = 0; i < n; i++) dni.push(dostepne[dostepne.length - 1 - Math.floor(i * dostepne.length / n)]);
  return dni.reverse();
}

/**
 * Plan sesji pracy.
 * 1) Spokojnie: sesje po ok. 3 h co ok. 2,4 dnia w oknie x dni przed terminem.
 * 2) Gdy czasu jest mniej niż x: najpierw sesje się WYDŁUŻAJĄ (ta sama liczba
 *    przerw, więcej godzin), a gdy przekroczyłyby 4 h – robimy je częściej,
 *    aż do codziennych; jedna sesja dziennie nie dłuższa niż 8 h.
 * Przy nauce dni wybiera krzywa zapominania, przy pozostałych zadaniach – równo.
 * Wykreślone dni są pomijane. Plan liczy się na nowo każdego dnia.
 */
function planSesji(z) {
  if (z.wykonane || !z.termin || czyBezPlanu(z) || czyPowtorka(z)) return [];
  if (czyEgzamin(z) && powtorkiEgzaminu(z).length) return [];
  const H = godzinyPozostale(z);
  if (H < 0.05) return [];

  const doTerminu = roznicaDni(DZIS, z.termin);
  const start = zrobioneSesje(z.id).includes(DZIS) ? 1 : 0;   // dziś już była sesja → od jutra
  const koniec = doTerminu - 1;
  if (koniec < start) return [];

  const dostepne = dniRobocze(start, koniec);
  if (!dostepne.length) return [];
  const juzSesji = zrobioneSesje(z.id).length;
  let okno, n;
  if (czyNauka(z)) {
    // NAUKA: liczba sesji z badań – co najmniej nauka + 3 powtórki, a sesje nie dłuższe niż ok. 2 h
    const wszystkich = Math.max(NAUKA_MIN_SESJI, Math.ceil(godzinyRazem(z) / NAUKA_SESJA_H));
    n = Math.max(1, wszystkich - juzSesji);
    // okno: spokojny plan (x dni), ale tak długie, żeby między sesjami był co najmniej dzień przerwy
    // (Cepeda i in. 2008: przy teście za ok. tydzień najlepsza przerwa to 20–40% tego czasu)
    okno = dostepne.slice(-Math.max(2 * n - 1, Math.ceil(pozostalaPraca(z))));
  } else {
    // POZOSTAŁE ZADANIA: spokojne tempo – sesja ok. 3 h co ok. 2,4 dnia w oknie x dni
    okno = dostepne.slice(-Math.max(1, Math.ceil(pozostalaPraca(z))));
    n = Math.max(1, Math.round(okno.length / ODSTEP_SPOKOJNY));
    if (H / n > MAX_SESJA_H) n = Math.ceil(H / MAX_SESJA_H);
  }
  n = Math.min(n, okno.length);            // najwyżej jedna sesja dziennie
  const h = H / n;   // gdy wychodzi ponad 4 h – sesje się wydłużają, a opis planu ostrzega

  const dni = czyNauka(z) ? rozkladEbbinghausa(okno, n, doTerminu) : rozkladRowny(okno, n);
  const juz = zrobioneSesje(z.id).length;
  return dni.map((offset, i) => ({
    data: dodajDni(DZIS, offset),
    zadanie: z,
    nr: juz + i + 1,
    z: juz + dni.length,
    h,
  }));
}

/** Krótki opis planu do szczegółów i podglądu w formularzu. */
function opisPlanu(z, plan) {
  const godz = plan.reduce((s, x) => s + x.h, 0);
  const nauka = czyNauka(z) ? ' · dni dobrane wg krzywej zapominania' : '';
  const tekst = `${plan.length} ${plan.length === 1 ? 'sesja' : plan.length < 5 ? 'sesje' : 'sesji'} po ${formatGodzin(plan[0].h)} (≈ ${formatGodzin(godz)} pracy)${nauka}: ${listaDniPracy(plan)}`;
  return tekst + htmlUwag(uwagiPlanu(z, plan));
}

/** Uwagi do planu (pokazywane po najechaniu na wykrzyknik). */
function uwagiPlanu(z, plan) {
  const uwagi = [];
  if (!plan.length) return uwagi;
  const hSpokojnie = czyNauka(z)
    ? godzinyRazem(z) / Math.max(NAUKA_MIN_SESJI, Math.ceil(godzinyRazem(z) / NAUKA_SESJA_H))
    : godzinyRazem(z) / Math.max(1, Math.round(szacowanyCzas(z) / ODSTEP_SPOKOJNY));
  if (plan[0].h > Math.max(hSpokojnie, SESJA_SPOKOJNA_H) * 1.1)
    uwagi.push(`Masz mniej czasu niż na spokojne tempo, więc sesje są dłuższe (spokojnie byłoby ok. ${formatGodzin(hSpokojnie)}).`);
  if (plan[0].h > MAX_DZIEN_H + 0.05)
    uwagi.push(`Musisz wydłużyć sesje do ${formatGodzin(plan[0].h)} – to więcej niż zalecane ${formatGodzin(MAX_DZIEN_H)} dziennie, powyżej tego nauka daje coraz mniej.`);
  return uwagi;
}
function htmlUwag(uwagi) {
  if (!uwagi.length) return '';
  const powazne = uwagi.length > 1;
  return ` <span class="uwaga ${powazne ? 'powazna' : ''}" tabindex="0" aria-label="Uwagi do planu">!<span class="uwaga-dymek" role="tooltip">${uwagi.map(u => `<span>${esc(u)}</span>`).join('')}</span></span>`;
}

/* ---------- Przewidywane zapamiętanie (krzywa Ebbinghausa) ---------- */
/** Ile % materiału zostanie w pamięci w dniu terminu przy obecnym planie (null, gdy to nie nauka). */
function przewidywaneZapamietanie(z) {
  if (!z.termin || z.wykonane || czyBezPlanu(z) || czyPowtorka(z)) return null;
  const doTerminu = roznicaDni(DZIS, z.termin);
  if (doTerminu < 0) return null;
  let dni;
  const powtorki = czyEgzamin(z) ? powtorkiEgzaminu(z) : [];
  if (powtorki.length) {
    // zrobione powtórki + te jeszcze przed nami (zaległe niezrobione się nie liczą)
    dni = powtorki.filter(p => p.wykonane || p.termin >= DZIS).map(p => roznicaDni(DZIS, p.termin));
  } else if (czyNauka(z)) {
    dni = [...zrobioneSesje(z.id).map(d => roznicaDni(DZIS, d)), ...planSesji(z).map(s => roznicaDni(DZIS, s.data))];
  } else {
    return null;
  }
  if (!dni.length) return 0;
  return Math.round(zapamietanie(dni.sort((a, b) => a - b), doTerminu) * 100);
}
function htmlZapamietania(proc, termin = 'w dniu terminu') {
  if (proc === null) return '';
  const klasa = proc >= 80 ? 'luz' : proc >= 60 ? 'spokojnie' : proc >= 40 ? 'pora' : 'pilne';
  return `<span class="znaczek ${klasa}" title="Model krzywej zapominania Ebbinghausa: R = e^(−t/S)">🧠 ok. ${proc}% ${termin}</span>`;
}

function sesjaOdhaczona(id, data) {
  return zrobioneSesje(id).includes(data);
}

/* =====================================================================
   Operacje na zadaniach
   ===================================================================== */
function znajdz(id) {
  return dane.zadania.find(z => z.id === id);
}
function noweId() {
  return dane.zadania.reduce((m, z) => Math.max(m, z.id), 0) + 1;
}
function przelaczWykonane(id) {
  const z = znajdz(id);
  if (!z) return;
  z.wykonane = !z.wykonane;
  zapiszLokalnie();
  odswiez();
  if (z.wykonane) powiadom(`Zrobione: „${z.tytul}”`, 'Cofnij', () => przelaczWykonane(id));
}
function usun(id) {
  const z = znajdz(id);
  if (!z) return;
  // razem z zadaniem znika wszystko, co do niego należy: powtórki egzaminu i odhaczone sesje
  // (zaplanowane sesje są liczone na bieżąco, więc znikają same)
  const doUsuniecia = new Set([id, ...(czyEgzamin(z) ? powtorkiEgzaminu(z).map(p => p.id) : [])]);
  const poprzednieZadania = dane.zadania.slice();
  const poprzednieSesje = {};
  for (const x of doUsuniecia) if (sesje[x]) { poprzednieSesje[x] = sesje[x]; delete sesje[x]; }
  dane.zadania = dane.zadania.filter(x => !doUsuniecia.has(x.id));
  zapiszLokalnie();
  odswiez();
  const ilePowtorek = doUsuniecia.size - 1;
  powiadom(`Usunięto „${z.tytul}”${ilePowtorek ? ` i ${ilePowtorek} powtórek` : ' razem z planem pracy'}.`, 'Cofnij', () => {
    dane.zadania = poprzednieZadania;
    Object.assign(sesje, poprzednieSesje);
    zapiszLokalnie();
    odswiez();
  });
}
function przelaczSesje(id, data, godziny) {
  const lista = wpisySesji(id);
  const i = lista.findIndex(w => w.d === data);
  if (i >= 0) lista.splice(i, 1);
  else lista.push({ d: data, h: Math.round((Number(godziny) || SESJA_SPOKOJNA_H) * 100) / 100 });
  if (lista.length) sesje[id] = lista; else delete sesje[id];
  zapiszLokalnie();
  odswiez();
}

/* =====================================================================
   Wyświetlanie
   ===================================================================== */
const tresc = document.getElementById('tresc');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function porownajTermin(a, b) {
  if (a.termin !== b.termin) {
    if (!a.termin) return 1;
    if (!b.termin) return -1;
    return a.termin < b.termin ? -1 : 1;
  }
  return WAGA_PRIORYTETU[b.priorytet] - WAGA_PRIORYTETU[a.priorytet];
}
function porownajWaznosc(a, b) {
  const r = WAGA_PRIORYTETU[b.priorytet] - WAGA_PRIORYTETU[a.priorytet];
  return r !== 0 ? r : porownajTermin(a, b);
}

/* ---------- Wszystkie zadania: kolumny z kafelkami ---------- */
const KOLUMNY = {
  poziom: [
    { klucz: 'krytyczne', nazwa: 'Krytyczne' },
    { klucz: 'pilne', nazwa: 'Pilne' },
    { klucz: 'pora', nazwa: 'Pora zaczynać' },
    { klucz: 'spokojnie', nazwa: 'Spokojnie' },
    { klucz: 'luz', nazwa: 'Luz' },
  ],
  waznosc: [
    { klucz: 'wysoki', nazwa: 'Wysoka ważność', opis: 'priorytet wysoki' },
    { klucz: 'sredni', nazwa: 'Średnia ważność', opis: 'priorytet średni' },
    { klucz: 'niski', nazwa: 'Niska ważność', opis: 'priorytet niski' },
  ],
};

/** Klasa koloru: intensywność (okresowe = szare). */
function klasaKoloru(z) {
  return z.wykonane ? 'p-zrobione' : 'p-' + poziom(z);
}
/** Znacznik przed tytułem: ↻ dla okresowych, !!! / !! / ! dla ważności. */
function znacznikWaznosci(z) {
  if (czyAkcja(z)) return '<span class="ikona-akcja" title="Pojedyncza akcja">🛴</span> ';
  if (czyOkresowe(z)) return '<span class="ikona-okres" title="Zadanie okresowe">↻</span> ';
  return `<span class="waga waga-${z.priorytet}" title="Ważność: ${NAZWA_PRIORYTETU[z.priorytet].toLowerCase()}">${ZNAK_WAZNOSCI[z.priorytet]}</span> `;
}

function htmlKafelka(z) {
  return `
    <li>
      <button class="kafelek ${klasaKoloru(z)} ${z.wykonane ? 'zrobiony' : ''}" data-akcja="szczegoly" data-id="${z.id}">
        <span class="kafelek-tytul">${znacznikWaznosci(z)}${esc(z.tytul)}</span>
        <span class="kafelek-podtytul ${z.wykonane ? '' : poziom(z)}">${z.wykonane ? 'zrobione' : esc(opisTerminu(z.termin))}</span>
      </button>
    </li>`;
}

function htmlKolumny(klucz, nazwa, opis, zadania) {
  return `
    <section class="kol kol-${klucz}">
      <header class="kol-gora">
        <span class="kol-nazwa">${nazwa}</span>
        <span class="licznik">${zadania.length}</span>
      </header>
      <div class="kol-opis">${opis}</div>
      ${zadania.length
        ? `<ul class="kafelki">${zadania.map(htmlKafelka).join('')}</ul>`
        : '<div class="kolumna-pusta">Pusto</div>'}
    </section>`;
}

function widokWszystkie() {
  const tagi = [...new Set(dane.zadania.flatMap(widoczneTagi))].sort((a, b) => a.localeCompare(b, 'pl'));
  const fraza = filtry.szukaj.trim().toLowerCase();
  const pasuje = z =>
    (!filtry.tag || z.tagi.includes(filtry.tag)) &&
    (!fraza || (z.tytul + ' ' + z.opis + ' ' + widoczneTagi(z).join(' ')).toLowerCase().includes(fraza));

  const aktywne = dane.zadania.filter(z => !z.wykonane && pasuje(z)).sort(porownajTermin);
  const zrobione = dane.zadania.filter(z => z.wykonane && pasuje(z)).sort(porownajTermin);
  const ileZrobionych = dane.zadania.filter(z => z.wykonane).length;

  const grupa = filtry.grupuj === 'waznosc' ? (z => z.priorytet) : poziom;
  const zwykle = aktywne.filter(z => !czyBezPlanu(z));
  const kolumny = KOLUMNY[filtry.grupuj].map(k =>
    htmlKolumny(k.klucz, k.nazwa, k.opis || opisProgu(k.klucz), zwykle.filter(z => grupa(z) === k.klucz)));
  // zadania okresowe nie mają priorytetu ani poziomu – osobna, szara kolumna
  kolumny.push(htmlKolumny('okresowe', 'Okresowe', 'siłownia, zakupy, opłaty… – bez priorytetu', aktywne.filter(z => rodzaj(z) === 'okresowe')));
  kolumny.push(htmlKolumny('akcja', '🛴 Pojedyncze akcje', 'jednorazowe sprawy, np. zakup pralki', aktywne.filter(czyAkcja)));
  if (filtry.pokazZrobione) kolumny.push(htmlKolumny('zrobione', 'Zrobione', 'odhaczone zadania', zrobione));

  const pasek = `
    <div class="filtry">
      <div class="przelacznik" role="group" aria-label="Układ kolumn">
        <span class="maly-tekst">Kolumny wg:</span>
        <button class="${filtry.grupuj === 'poziom' ? 'wl' : ''}" data-akcja="grupuj" data-wartosc="poziom">Intensywności</button>
        <button class="${filtry.grupuj === 'waznosc' ? 'wl' : ''}" data-akcja="grupuj" data-wartosc="waznosc">Ważności</button>
      </div>
      <input type="search" data-filtr="szukaj" placeholder="Szukaj…" value="${esc(filtry.szukaj)}" aria-label="Szukaj">
      <select data-filtr="tag" aria-label="Tag">
        <option value="">Wszystkie tagi</option>
        ${tagi.map(t => `<option value="${esc(t)}" ${filtry.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
      </select>
      <label class="pokaz-zrobione">
        <input type="checkbox" data-akcja="pokaz-zrobione" ${filtry.pokazZrobione ? 'checked' : ''}>
        Pokaż zrobione (${ileZrobionych})
      </label>
    </div>`;

  if (!dane.zadania.length) {
    return pasek + `<div class="pusto">Nie masz jeszcze żadnych zadań.<br>
      <button class="przycisk glowny" data-akcja="nowe">+ Dodaj pierwsze zadanie</button>
      <button class="przycisk" data-akcja="wczytaj">Wczytaj plik JSON</button></div>`;
  }
  return pasek + `<div class="tablica">${kolumny.join('')}</div>
    <p class="maly-tekst tydzien-stopka">Kolor paska = intensywność, !!! / !! / ! = ważność. W kolumnie zadania są ułożone według terminu. Kliknij kafelek, aby zobaczyć szczegóły.</p>`;
}

/* ---------- Okno szczegółów zadania ---------- */
const oknoSzczegoly = document.getElementById('szczegoly');

function pokazSzczegoly(id) {
  const z = znajdz(id);
  if (!z) { if (oknoSzczegoly.open) oknoSzczegoly.close(); return; }
  szczegolyId = id;
  const p = poziom(z);
  const okresowe = czyBezPlanu(z);   // okresowe i pojedyncze akcje – bez priorytetu i planu
  const plan = planSesji(z);
  const zrobioneH = godzinyZrobione(z.id);
  let planHtml;
  const powtorki = czyEgzamin(z) ? powtorkiEgzaminu(z) : [];
  if (z.wykonane) planHtml = 'Zadanie zrobione.';
  else if (czyAkcja(z)) planHtml = 'Pojedyncza akcja – bez rozpisanej pracy, po prostu ją załatw.';
  else if (okresowe) planHtml = 'Zadanie okresowe – bez rozpisanej pracy, po prostu zrób je w swoim dniu.';
  else if (czyPowtorka(z)) planHtml = `To powtórka przed egzaminem${czasPowtorkiH(z) ? ` (${opisDlugosciPowtorki(z)})` : ''} – sama jest sesją nauki.`;
  else if (powtorki.length) planHtml = `Powtórki: ${powtorki.filter(x => x.wykonane).length} z ${powtorki.length} zrobione · ` + powtorki.map(x => (x.wykonane ? '✓ ' : '') + ladnaData(x.termin)).join(' · ');
  else if (!z.termin) planHtml = 'Bez terminu – nie da się zaplanować sesji. Zrób je w luźniejszy dzień.';
  else if (godzinyPozostale(z) < 0.05) planHtml = 'Cała zaplanowana praca zrobiona.';
  else if (!plan.length) planHtml = 'Termin jest dziś lub minął – nie planujemy już sesji, czas działać.';
  else planHtml = opisPlanu(z, plan);
  const doTerminu = z.termin ? roznicaDni(DZIS, z.termin) : null;
  const wykreslone = doTerminu > 0 ? doTerminu - dniNaPrace(z) : 0;
  const dniNaPraceHtml = okresowe || !z.termin ? '–'
    : `${formatDni(dniNaPrace(z))} do terminu${wykreslone ? ` <span class="maly-tekst">(bez ${formatDni(wykreslone)} wykreślonych)</span>` : ''}`;
  const czasHtml = okresowe ? '–'
    : `${formatDni(szacowanyCzas(z))}${czasZTagu(z) !== null ? '' : godzinyZTagu(z) !== null ? ' <span class="maly-tekst">(wyliczone z godzin)</span>' : ' <span class="maly-tekst">(domyślnie wg ważności)</span>'}`
      + ` <span class="maly-tekst">${godzinyZTagu(z) !== null ? '' : '≈ '}${formatGodzin(godzinyRazem(z))} czystej pracy${godzinyZTagu(z) !== null ? ' (wpisane ręcznie)' : ''}</span>`
      + (zrobioneH ? ` · zrobione: ${formatGodzin(zrobioneH)}` : '');

  document.getElementById('szczegoly-tresc').innerHTML = `
    <div class="szcz-gora">
      <h2 class="${z.wykonane ? 'przekreslone' : ''}">${esc(z.tytul)}</h2>
      <button type="button" class="ikona" data-akcja="zamknij-szczegoly" aria-label="Zamknij">✕</button>
    </div>
    ${z.opis ? `<p class="szcz-opis">${esc(z.opis)}</p>` : '<p class="szcz-opis maly-tekst">Brak opisu.</p>'}
    <dl class="szcz-lista">
      <dt>Termin</dt><dd>${!z.termin ? 'bez terminu' : roznicaDni(DZIS, z.termin) > 1 ? esc(opisTerminu(z.termin)) : esc(ladnaData(z.termin)) + ' · ' + esc(opisTerminu(z.termin))}</dd>
      <dt>Ważność</dt><dd>${okresowe ? `<span class="znaczek">${czyAkcja(z) ? '🛴 pojedyncza akcja' : '↻ zadanie okresowe'} – bez priorytetu</span>` : `<span class="znaczek w-${z.priorytet}">${NAZWA_PRIORYTETU[z.priorytet]}</span>`}</dd>
      <dt>Czas pracy</dt><dd>${czasHtml}</dd>
      <dt>Dni na pracę</dt><dd>${dniNaPraceHtml}</dd>
      ${przewidywaneZapamietanie(z) !== null ? `<dt>Zapamiętanie</dt><dd>${htmlZapamietania(przewidywaneZapamietanie(z))} <span class="maly-tekst">przewidywane z krzywej zapominania przy tym planie</span></dd>` : ''}
      <dt>Intensywność</dt><dd>${z.wykonane || okresowe ? '–' : `<span class="znaczek ${p}">${NAZWA_POZIOMU[p]}</span> <span class="maly-tekst">${esc(opisWskaznika(z))}</span>`}</dd>
      <dt>Tagi</dt><dd>${widoczneTagi(z).length ? widoczneTagi(z).map(t => `<span class="znaczek tag">#${esc(t)}</span>`).join(' ') : '–'}</dd>
      <dt>Status</dt><dd>${z.wykonane ? '✓ Zrobione' : 'Do zrobienia'}</dd>
      <dt>Plan pracy</dt><dd>${planHtml}</dd>
    </dl>
    <div class="okno-stopka szcz-stopka">
      <button type="button" class="przycisk usun-przycisk" data-akcja="usun" data-id="${z.id}">Usuń</button>
      <span style="flex:1"></span>
      <button type="button" class="przycisk" data-akcja="edytuj" data-id="${z.id}">Edytuj</button>
      <button type="button" class="przycisk glowny" data-akcja="odhacz" data-id="${z.id}">${z.wykonane ? 'Cofnij wykonanie' : '✓ Oznacz jako zrobione'}</button>
    </div>`;
  if (!oknoSzczegoly.open) oknoSzczegoly.showModal();
}
oknoSzczegoly.addEventListener('close', () => { szczegolyId = null; });
oknoSzczegoly.addEventListener('click', e => { if (e.target === oknoSzczegoly) oknoSzczegoly.close(); });

/* =====================================================================
   TERMINARZ – kalendarz: tydzień / 2 tygodnie / miesiąc
   Siatka zawsze od poniedziałku. Im więcej dni, tym mniejsze kratki:
   tydzień i 2 tygodnie pokazują nazwy zadań, miesiąc – kolorowe kropki
   (kolor = pilność). Kliknięcie zadania lub kropki otwiera szczegóły.
   ===================================================================== */
const terminarz = { zakres: 'tydzien', przesuniecie: 0, pokazSesje: true };
const NAZWY_DNI = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

function poniedzialek(s) {
  return dodajDni(s, -((zISO(s).getDay() + 6) % 7));
}

function zakresTerminarza() {
  const pon = poniedzialek(DZIS);
  if (terminarz.zakres === 'tydzien') return { start: dodajDni(pon, 7 * terminarz.przesuniecie), dni: 7 };
  if (terminarz.zakres === '2tyg') return { start: dodajDni(pon, 14 * terminarz.przesuniecie), dni: 14 };
  const t = zISO(DZIS);
  const pierwszy = new Date(t.getFullYear(), t.getMonth() + terminarz.przesuniecie, 1);
  const ostatni = new Date(pierwszy.getFullYear(), pierwszy.getMonth() + 1, 0);
  const start = poniedzialek(naISO(pierwszy));
  const koniec = dodajDni(poniedzialek(naISO(ostatni)), 6);
  return { start, dni: roznicaDni(start, koniec) + 1, miesiac: pierwszy.getMonth(), pierwszy };
}

/** Terminy i dni pracy dla każdego dnia w zakresie. */
function daneKalendarza(start, dni) {
  const mapa = {};
  for (let i = 0; i < dni; i++) mapa[dodajDni(start, i)] = { terminy: [], sesje: [] };
  for (const z of dane.zadania) {
    if (z.wykonane) continue;
    if (z.termin) {
      const dzien = z.termin < DZIS ? DZIS : z.termin;   // zaległe pokazujemy dziś
      if (mapa[dzien]) mapa[dzien].terminy.push(z);
    }
    const plan = planSesji(z);
    for (const s of plan) {
      if (mapa[s.data]) mapa[s.data].sesje.push(s);
    }
    // sesje odhaczone (np. dziś) – pokazujemy jako zrobione
    const wpisy = wpisySesji(z.id);
    wpisy.forEach((w, i) => {
      if (mapa[w.d]) mapa[w.d].sesje.push({ data: w.d, zadanie: z, nr: i + 1, z: wpisy.length + plan.length, h: w.h, zrobiona: true });
    });
  }
  for (const info of Object.values(mapa)) {
    info.terminy.sort((a, b) => (WAGA_PRIORYTETU[b.priorytet] - WAGA_PRIORYTETU[a.priorytet]) || porownajTermin(a, b));
    info.sesje.sort((a, b) => (a.zrobiona ? 1 : 0) - (b.zrobiona ? 1 : 0));
  }
  return mapa;
}

function htmlTerminuKal(z) {
  const zalegle = z.termin < DZIS;
  return `
    <li class="karta ${klasaKoloru(z)}">
      <button class="odhacz maly-odhacz" data-akcja="odhacz" data-id="${z.id}" title="Oznacz jako zrobione" aria-label="Oznacz jako zrobione"></button>
      <button class="karta-tresc" data-akcja="szczegoly" data-id="${z.id}" title="Pokaż szczegóły">
        <span class="karta-tytul">${znacznikWaznosci(z)}${esc(z.tytul)}</span>
        ${zalegle ? `<span class="znaczek krytyczne">zaległe · ${esc(ladnaData(z.termin, false))}</span>` : ''}
      </button>
    </li>`;
}

function htmlSesjiKal(s) {
  const dzis = s.data === DZIS;
  const zrobiona = !!s.zrobiona;
  return `
    <li class="sesja-kal ${zrobiona ? 'zrobiona' : ''}">
      ${dzis ? `<button class="odhacz maly-odhacz kwadrat" data-akcja="sesja" data-id="${s.zadanie.id}" data-data="${s.data}" data-h="${s.h}"
        title="${zrobiona ? 'Cofnij' : 'Odhacz sesję'}" aria-label="Odhacz sesję">${zrobiona ? '✓' : ''}</button>` : '<span class="sesja-znak"></span>'}
      <button class="karta-tresc" data-akcja="szczegoly" data-id="${s.zadanie.id}" title="Sesja pracy – pokaż zadanie">
        <span class="karta-tytul">${czyNauka(s.zadanie) ? 'Nauka' : 'Praca'} ${s.nr}/${s.z} · ${formatGodzin(s.h)}: ${esc(s.zadanie.tytul)}</span>
      </button>
    </li>`;
}

function htmlKropek(info) {
  // 1. rząd: terminy – kropki w kolorze intensywności, okresowe jako szare kwadraty
  const terminy = info.terminy.map(z => {
    const p = poziom(z);
    return `<button class="kropka-kal ${p}" data-akcja="szczegoly" data-id="${z.id}"
      title="${esc(z.tytul)} (${NAZWA_POZIOMU[p].toLowerCase()})" aria-label="${esc(z.tytul)}">${p === 'akcja' ? '🛴' : ''}</button>`;
  }).join('');
  // 2. rząd: dni pracy – małe kółka, żeby nie zasłaniały terminów
  const praca = terminarz.pokazSesje ? info.sesje.map(s =>
    `<button class="kropka-kal sesja ${s.zrobiona ? 'zrobiona' : ''}" data-akcja="szczegoly" data-id="${s.zadanie.id}"
      title="${czyNauka(s.zadanie) ? 'Nauka' : 'Praca'} ${s.nr}/${s.z} · ${formatGodzin(s.h)}: ${esc(s.zadanie.tytul)}" aria-label="Sesja: ${esc(s.zadanie.tytul)}"></button>`).join('') : '';
  return (terminy ? `<div class="kropki">${terminy}</div>` : '') + (praca ? `<div class="kropki kropki-praca">${praca}</div>` : '');
}

function htmlDniaKal(d, info, tryb, zakres) {
  const data = zISO(d);
  const przeszly = d < DZIS;
  const poza = tryb === 'miesiac' && data.getMonth() !== zakres.miesiac;
  const wolny = czyWolny(d);
  const klasy = ['dzien-kal', d === DZIS && 'dzisiaj', przeszly && 'przeszly', poza && 'poza', wolny && 'wolny'].filter(Boolean).join(' ');

  let naglowek;
  if (tryb === 'tydzien') {
    naglowek = `<span class="kal-dzien">${d === DZIS ? 'Dziś' : esc(data.toLocaleDateString('pl-PL', { weekday: 'long' }))}</span>
      <span class="kal-data">${esc(data.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }))}</span>`;
  } else {
    const nr = data.getDate();
    const mies = (nr === 1 || d === zakres.start) ? ' ' + esc(data.toLocaleDateString('pl-PL', { month: 'short' })) : '';
    naglowek = `<span class="kal-nr">${nr}${mies}</span>`;
  }

  let srodek;
  if (tryb === 'miesiac') {
    srodek = htmlKropek(info);
  } else {
    const pozycje = [
      ...info.terminy.map(htmlTerminuKal),
      ...(terminarz.pokazSesje ? info.sesje.map(htmlSesjiKal) : []),
    ];
    srodek = pozycje.length ? `<ul class="karty">${pozycje.join('')}</ul>` : '';
  }

  const dodaj = tryb === 'miesiac' || przeszly ? ''
    : `<button class="dodaj-w-dniu" data-akcja="nowe" data-data="${d}" title="Dodaj zadanie na ten dzień">${tryb === 'tydzien' ? '+ Dodaj' : '+'}</button>`;

  const powod = wolny ? `<span class="wolny-powod" title="Dzień wykreślony: ${esc(wolne[d] || 'wolne')}">✕ ${esc(wolne[d] || 'wolne')}</span>` : '';
  // kliknięcie w puste miejsce dnia (od dziś) otwiera okno wykreślania
  return `
    <div class="${klasy}" ${przeszly ? '' : `data-dzien="${d}"`} ${przeszly ? '' : 'title="Kliknij, aby wykreślić dzień (np. wakacje)"'}>
      <div class="kal-gora">${naglowek}</div>
      ${powod}
      ${srodek}
      ${dodaj}
    </div>`;
}

function widokTerminarz() {
  const zakres = zakresTerminarza();
  const tryb = terminarz.zakres === 'miesiac' ? 'miesiac' : terminarz.zakres === '2tyg' ? 'dwa' : 'tydzien';
  const mapa = daneKalendarza(zakres.start, zakres.dni);
  const koniec = dodajDni(zakres.start, zakres.dni - 1);

  const tytul = tryb === 'miesiac'
    ? (t => t.charAt(0).toUpperCase() + t.slice(1))(zakres.pierwszy.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }))
    : `${ladnaData(zakres.start, false)} – ${ladnaData(koniec, false)} ${zISO(koniec).getFullYear()}`;

  const przycisk = (w, n) => `<button class="${terminarz.zakres === w ? 'wl' : ''}" data-akcja="zakres" data-wartosc="${w}">${n}</button>`;
  const pasekNarzedzi = `
    <div class="filtry term-pasek">
      <div class="przelacznik" role="group" aria-label="Zakres">
        ${przycisk('tydzien', 'Tydzień')}${przycisk('2tyg', '2 tygodnie')}${przycisk('miesiac', 'Miesiąc')}
      </div>
      <div class="term-nawigacja">
        <button class="przycisk maly" data-akcja="przesun" data-wartosc="-1" aria-label="Wcześniej">←</button>
        <button class="przycisk maly" data-akcja="przesun" data-wartosc="0" ${terminarz.przesuniecie === 0 ? 'disabled' : ''}>Dziś</button>
        <button class="przycisk maly" data-akcja="przesun" data-wartosc="1" aria-label="Później">→</button>
      </div>
      <strong class="term-tytul">${esc(tytul)}</strong>
      <label class="pokaz-zrobione">
        <input type="checkbox" data-akcja="pokaz-sesje" ${terminarz.pokazSesje ? 'checked' : ''}> Dni pracy
      </label>
    </div>`;

  const naglowkiDni = tryb === 'tydzien' ? '' : `<div class="kal-naglowki">${NAZWY_DNI.map(n => `<span>${n}</span>`).join('')}</div>`;
  const komorki = Object.entries(mapa).map(([d, info]) => htmlDniaKal(d, info, tryb, zakres)).join('');

  const legenda = tryb === 'miesiac'
    ? `<span class="legenda">${POZIOMY.map(p => `<i class="kropka-kal ${p.klucz}"></i> ${p.nazwa.toLowerCase()}`).join(' ')}
       <i class="kropka-kal okresowe"></i> okresowe <span class="kropka-kal akcja">🛴</span> akcja
       ${terminarz.pokazSesje ? '<i class="kropka-kal sesja"></i> dzień pracy' : ''}</span> Kliknij kropkę lub kwadrat, aby zobaczyć zadanie, a puste miejsce w dniu – aby go wykreślić (np. wakacje).`
    : 'Kolor paska = intensywność (zielony luz → fioletowy krytyczne, szary ↻ = okresowe, 🛴 = pojedyncza akcja), !!! / !! / ! = ważność. Kliknij zadanie, aby zobaczyć szczegóły, a kółko – aby je odhaczyć. Dni pracy są w przerywanej ramce. Kliknij puste miejsce w dniu, aby go wykreślić (np. wakacje) – plan się wtedy ściśnie.';
  const bezTerminu = dane.zadania.filter(z => !z.wykonane && !z.termin).length;

  return pasekNarzedzi + naglowkiDni +
    `<div class="kal kal-${tryb}">${komorki}</div>
     <p class="maly-tekst tydzien-stopka">${legenda}
       ${bezTerminu ? ` · Bez terminu: ${bezTerminu} zad. <button class="link" data-widok="wszystkie">zobacz →</button>` : ''}</p>`;
}

/* =====================================================================
   EGZAMINY I POWTÓRKI (z pliku)
   Egzamin = zadanie z tagiem #egzamin, powtórka = zadanie z tagiem #powtórka
   i tytułem "Powtórka 2/5 – <tytuł egzaminu>". Egzamin z powtórkami nie dostaje
   osobnych sesji, a usunięcie egzaminu usuwa też jego powtórki.
   Długość powtórki może być w ukrytym tagu, np. "⏱30min", "⏱2h", "⏱1d".
   ===================================================================== */
const TAG_EGZAMIN = 'egzamin';
const TAG_POWTORKA = 'powtórka';

/** Zamiana na godziny: 1 dzień nauki = 6 h. */
function naGodziny(wartosc, jednostka) {
  const v = parseFloat(String(wartosc).replace(',', '.'));
  if (!(v > 0)) return 0;
  return jednostka === 'min' ? v / 60 : jednostka === 'd' ? v * GODZIN_W_DNIU_POWTORKI : v;
}
function czasPowtorkiH(z) {
  for (const t of z.tagi) {
    const m = /^⏱\s*(\d+(?:[.,]\d+)?)\s*(min|h|d)$/.exec(t);
    if (m) return naGodziny(m[1], m[2]);
  }
  return 0;
}
function opisDlugosciPowtorki(z) {
  const t = z.tagi.find(x => /^⏱.*d$/.test(x));
  return t ? formatDni(parseFloat(t.slice(1).replace(',', '.'))) : formatGodzin(czasPowtorkiH(z));
}
function czyEgzamin(z) { return z.tagi.includes(TAG_EGZAMIN); }
function czyPowtorka(z) { return z.tagi.includes(TAG_POWTORKA); }
function powtorkiEgzaminu(e) {
  const koncowka = ' – ' + e.tytul;
  return dane.zadania.filter(z => z.id !== e.id && czyPowtorka(z) && z.tytul.endsWith(koncowka)).sort(porownajTermin);
}

function odswiez() {
  const fokus = document.activeElement?.dataset?.filtr;   // nie gubimy kursora w wyszukiwarce

  if (oknoSzczegoly.open && szczegolyId !== null) pokazSzczegoly(szczegolyId);

  if (widok === 'terminarz') tresc.innerHTML = widokTerminarz();
  else tresc.innerHTML = widokWszystkie();

  if (fokus) {
    const pole = tresc.querySelector(`[data-filtr="${fokus}"]`);
    if (pole) { pole.focus(); if (pole.setSelectionRange && pole.type === 'search') pole.setSelectionRange(pole.value.length, pole.value.length); }
  }

  document.querySelectorAll('.zakladka').forEach(b => b.classList.toggle('aktywna', b.dataset.widok === widok));

  const aktywne = dane.zadania.filter(z => !z.wykonane).length;
  const zalegle = dane.zadania.filter(poTerminie).length;
  const zrobione = dane.zadania.length - aktywne;
  document.getElementById('podtytul').textContent =
    `${ladnaData(DZIS)} · do zrobienia: ${aktywne}` + (zalegle ? ` · po terminie: ${zalegle}` : '') + ` · zrobione: ${zrobione}`;
}

/* =====================================================================
   Formularz dodawania / edycji
   ===================================================================== */
const okno = document.getElementById('okno');
const formularz = document.getElementById('formularz');

function zbierzFormularz() {
  const f = new FormData(formularz);
  const typ = f.get('rodzaj') || 'zwykle';
  const okresowe = typ !== 'zwykle';   // okresowe i pojedyncze akcje nie mają priorytetu ani czasu pracy
  const czas = parseFloat(String(f.get('czas') || '').replace(',', '.'));
  // tagi widoczne dla użytkownika + ukryte: "okresowe" i "⏱Nd" (szacowany czas pracy)
  const tagi = (f.get('tagi') || '').split(',').map(t => t.trim().replace(/^#/, '')).filter(t => t && !czyTagUkryty(t));
  const godziny = parseFloat(String(f.get('godziny') || '').replace(',', '.'));
  if (typ === 'okresowe') tagi.push(TAG_OKRESOWE);
  else if (typ === 'akcja') tagi.push(TAG_AKCJA);
  else {
    // pola dni i godzin są połączone – zapisujemy to, które użytkownik wpisał (drugie wynika z krzywej)
    if (formularz.dataset.zrodlo === 'godziny') {
      if (godziny > 0) tagi.push(`${ZNAK_CZASU}${Math.round(godziny * 10) / 10}h`);
    } else if (czas > 0) {
      tagi.push(tagCzasu(Math.round(czas * 10) / 10));
    }
  }
  const poprzednie = edytowaneId !== null ? znajdz(edytowaneId) : null;
  return {
    tytul: (f.get('tytul') || '').trim(),
    opis: (f.get('opis') || '').trim(),
    termin: f.get('termin') || null,
    // okresowe / akcja nie mają priorytetu, ale format JSON wymaga wartości – zostawiamy dotychczasową (albo "niski")
    priorytet: okresowe ? (poprzednie ? poprzednie.priorytet : 'niski') : (f.get('priorytet') || 'sredni'),
    tagi: [...new Set(tagi)],
  };
}

/** Okresowe zadanie nie ma ważności ani czasu pracy – chowamy te pola. */
function ustawPolaOkresowe() {
  const okresowe = (formularz.querySelector('input[name="rodzaj"]:checked')?.value || 'zwykle') !== 'zwykle';
  document.getElementById('pole-waznosc').hidden = okresowe;
  document.getElementById('pole-czas').hidden = okresowe;
  document.getElementById('pole-godziny').hidden = okresowe;
  formularz.czas.placeholder = `domyślnie ${formatDni(DOMYSLNY_CZAS[formularz.querySelector('input[name="priorytet"]:checked')?.value || 'sredni'])}`;
}

function zaokr(v) { return Math.round(v * 10) / 10; }

/** Dni ↔ godziny: wpisanie jednego od razu przelicza drugie wg krzywej użytkownika. */
function przeliczDniGodziny(e) {
  const nazwa = e && e.target && e.target.name;
  const v = parseFloat(String(e && e.target ? e.target.value : '').replace(',', '.'));
  if (nazwa === 'czas') {
    formularz.dataset.zrodlo = 'dni';
    formularz.godziny.value = v > 0 ? zaokr(godzinyZDni(v)) : '';
  } else if (nazwa === 'godziny') {
    formularz.dataset.zrodlo = 'godziny';
    formularz.czas.value = v > 0 ? zaokr(dniZGodzin(v)) : '';
  }
}

/** Podpowiedzi w pustych polach: domyślny czas wg ważności i jego godziny. */
function pokazRekomendacjeGodzin() {
  const pri = formularz.querySelector('input[name="priorytet"]:checked')?.value || 'sredni';
  const dni = DOMYSLNY_CZAS[pri];
  formularz.czas.placeholder = `domyślnie ${String(dni).replace('.', ',')}`;
  formularz.godziny.placeholder = `domyślnie ${String(zaokr(godzinyZDni(dni))).replace('.', ',')}`;
  document.getElementById('rekomendacja-godzin').textContent =
    'Pola są połączone: wpisz dni albo godziny – drugie przeliczy się samo wg Twojego stylu pracy.';
}

function podgladPlanu() {
  ustawPolaOkresowe();
  pokazRekomendacjeGodzin();
  const w = zbierzFormularz();
  const el = document.getElementById('podglad-planu');
  const proba = { id: edytowaneId ?? -1, ...w, wykonane: false };
  if (czyAkcja(proba)) {
    el.innerHTML = '🛴 Pojedyncza akcja: bez priorytetu i bez czasu pracy – w kalendarzu pokaże się z ikonką hulajnogi.';
    return;
  }
  if (czyOkresowe(proba)) {
    el.innerHTML = 'Zadanie okresowe: bez priorytetu i bez rozpisanej pracy – w kalendarzu pokaże się jako szary kwadrat.';
    return;
  }
  if (!w.termin || !poprawnaData(w.termin)) {
    el.innerHTML = 'Dodaj termin, a aplikacja policzy intensywność i rozłoży dni pracy przed nim.';
    return;
  }
  if (czyPowtorka(proba)) {
    el.innerHTML = 'To powtórka przed egzaminem – nie dostaje osobnych dni pracy.';
    return;
  }
  const p = poziom(proba);
  const plan = planSesji(proba);
  const naglowek = `Spokojnie: <b>${formatDni(szacowanyCzas(proba))}</b> (${godzinyZTagu(proba) !== null ? '' : '≈ '}${formatGodzin(godzinyRazem(proba))} pracy${godzinyZTagu(proba) !== null ? ', wpisane ręcznie' : ''}) · Intensywność: <b class="tekst-${p}">${NAZWA_POZIOMU[p]}</b> (${esc(opisWskaznika(proba))})`;
  if (!plan.length) {
    el.innerHTML = naglowek + '<br>Brak sesji do zaplanowania przed terminem.';
    return;
  }
  const pz = czyNauka(proba) ? przewidywaneZapamietanie(proba) : null;
  el.innerHTML = `${naglowek}<br>Plan: ${opisPlanu(proba, plan)}.${pz !== null ? `<br>Przewidywane zapamiętanie: ${htmlZapamietania(pz)}` : ''}`;
}

function otworzFormularz(id = null, domyslnyTermin = null) {
  edytowaneId = id;
  const z = id !== null ? znajdz(id) : null;
  document.getElementById('okno-tytul').textContent = z ? 'Edytuj zadanie' : 'Nowe zadanie';
  formularz.reset();
  formularz.tytul.value = z ? z.tytul : '';
  formularz.opis.value = z ? z.opis : '';
  formularz.termin.value = z && z.termin ? z.termin : (domyslnyTermin || '');
  formularz.tagi.value = z ? widoczneTagi(z).join(', ') : '';
  formularz.querySelector(`input[name="rodzaj"][value="${z ? rodzaj(z) : 'zwykle'}"]`).checked = true;
  // dni i godziny pokazujemy oba (jedno wpisane, drugie przeliczone)
  const godz = z ? godzinyZTagu(z) : null;
  const czas = z ? czasZTagu(z) : null;
  formularz.dataset.zrodlo = godz !== null ? 'godziny' : 'dni';
  formularz.czas.value = czas !== null ? czas : godz !== null ? zaokr(dniZGodzin(godz)) : '';
  formularz.godziny.value = godz !== null ? godz : czas !== null ? zaokr(godzinyZDni(czas)) : '';
  const pri = z ? z.priorytet : 'sredni';
  formularz.querySelector(`input[name="priorytet"][value="${pri}"]`).checked = true;
  document.getElementById('blad-tytul').textContent = '';

  const wszystkieTagi = [...new Set(dane.zadania.flatMap(widoczneTagi))];
  document.getElementById('lista-tagow').innerHTML = wszystkieTagi.map(t => `<option value="${esc(t)}">`).join('');

  podgladPlanu();
  okno.showModal();
  formularz.tytul.focus();
}

formularz.addEventListener('input', e => { przeliczDniGodziny(e); podgladPlanu(); });
formularz.addEventListener('submit', e => {
  e.preventDefault();
  const w = zbierzFormularz();
  if (!w.tytul) {
    document.getElementById('blad-tytul').textContent = 'Podaj tytuł zadania.';
    formularz.tytul.focus();
    return;
  }
  if (w.termin && !poprawnaData(w.termin)) w.termin = null;

  if (edytowaneId !== null) {
    const z = znajdz(edytowaneId);
    Object.assign(z, w);
    powiadom(`Zapisano zmiany w „${z.tytul}”.`);
  } else {
    dane.zadania.push(uporzadkuj({ id: noweId(), ...w, wykonane: false }));
    powiadom(`Dodano „${w.tytul}”.`);
  }
  zapiszLokalnie();
  okno.close();
  odswiez();
});

/* =====================================================================
   Okno dnia: wykreślanie dni (wakacje, wyjazd, choroba...)
   Wykreślone dni nie liczą się do czasu na pracę, więc plan się kompresuje.
   Zapisujemy je w przeglądarce (plik JSON zostaje w niezmienionym formacie).
   ===================================================================== */
const oknoDnia = document.getElementById('okno-dnia');
const formDnia = document.getElementById('form-dnia');

function otworzOknoDnia(data) {
  formDnia.dataset.data = data;
  const wolny = czyWolny(data);
  document.getElementById('dzien-tytul').textContent =
    zISO(data).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  formDnia.powod.value = wolny ? wolne[data] : '';
  formDnia.doDnia.value = '';
  formDnia.doDnia.min = data;
  document.getElementById('dzien-info').innerHTML = wolny
    ? `Ten dzień jest wykreślony: <b>${esc(wolne[data] || 'wolne')}</b>. Możesz zmienić powód albo go przywrócić.`
    : 'Wykreślony dzień nie liczy się do czasu na pracę – dni pracy przesuną się na pozostałe dni, a intensywność zadań odpowiednio wzrośnie.';
  document.getElementById('dzien-przywroc').hidden = !wolny;
  document.getElementById('dzien-przywroc').dataset.data = data;
  document.getElementById('dzien-zapisz').textContent = wolny ? 'Zapisz' : 'Wykreśl dzień';
  oknoDnia.showModal();
  formDnia.powod.focus();
}

formDnia.addEventListener('submit', e => {
  e.preventDefault();
  const od = formDnia.dataset.data;
  const doDnia = poprawnaData(formDnia.doDnia.value) && formDnia.doDnia.value >= od ? formDnia.doDnia.value : od;
  const powod = formDnia.powod.value.trim() || 'wolne';
  const ile = roznicaDni(od, doDnia) + 1;
  for (let i = 0; i < ile; i++) wolne[dodajDni(od, i)] = powod;
  zapiszLokalnie();
  oknoDnia.close();
  odswiez();
  powiadom(ile === 1 ? `Wykreślono ${ladnaData(od)} (${powod}).` : `Wykreślono ${ile} dni (${powod}).`, 'Cofnij', () => {
    for (let i = 0; i < ile; i++) delete wolne[dodajDni(od, i)];
    zapiszLokalnie();
    odswiez();
  });
});

function przywrocDni(data) {
  // przywracamy cały ciągły blok dni z tym samym powodem (np. całe wakacje)
  const powod = wolne[data];
  let od = data, doDnia = data;
  while (wolne[dodajDni(od, -1)] === powod) od = dodajDni(od, -1);
  while (wolne[dodajDni(doDnia, 1)] === powod) doDnia = dodajDni(doDnia, 1);
  const ile = roznicaDni(od, doDnia) + 1;
  const kopia = {};
  for (let i = 0; i < ile; i++) { const d = dodajDni(od, i); kopia[d] = wolne[d]; delete wolne[d]; }
  zapiszLokalnie();
  oknoDnia.close();
  odswiez();
  powiadom(ile === 1 ? `Przywrócono ${ladnaData(data)}.` : `Przywrócono ${ile} dni (${powod}).`, 'Cofnij', () => {
    Object.assign(wolne, kopia);
    zapiszLokalnie();
    odswiez();
  });
}

/* =====================================================================
   STYL PRACY – pytamy przy pierwszym wejściu
   1) Jaką pracę lubisz: mało intensywną, intensywną, bardzo intensywną?
   2) Wybierz tabelkę, która najlepiej do Ciebie pasuje (albo wpisz własne liczby).
   Z wybranych punktów aplikacja buduje swoją funkcję "dni → godziny pracy".
   ===================================================================== */
const STYLE = {
  malo: {
    nazwa: 'Mało intensywna',
    opis: 'Wolę pracować po trochu, bez długich posiedzeń.',
    tabele: [[1.5, 4, 20], [2, 5, 25], [2, 6, 30]],
  },
  intensywna: {
    nazwa: 'Intensywna',
    opis: 'Lubię porządnie usiąść do pracy, ale z rozsądkiem.',
    tabele: [[3.5, 7.5, 37.5], [2, 10, 40], [4, 15, 100]],
  },
  bardzo: {
    nazwa: 'Bardzo intensywna',
    opis: 'Najlepiej idzie mi, gdy pracuję dużo i długo.',
    tabele: [[4, 16, 110], [5, 18, 130], [6, 22, 160]],
  },
};
/* ---------- Progi intensywności (kiedy luz, a kiedy krytycznie) ----------
   Podajemy dwa progi (w % potrzebnego czasu): od ilu zaczyna się Luz
   i poniżej ilu jest Krytycznie. Trzy środkowe poziomy dzielą przedział po równo. */
const SZABLONY_PROGOW = {
  ostrozny: { nazwa: 'Ostrożny', opis: 'Wolę mieć duży zapas – ostrzegaj mnie wcześnie.', luz: 1.5, kryt: 0.6 },
  zrownowazony: { nazwa: 'Zrównoważony', opis: 'Luz, gdy czasu jest tyle, ile trzeba.', luz: 1.0, kryt: 0.301 },
  presja: { nazwa: 'Na ostatnią chwilę', opis: 'Dobrze działam pod presją – nie panikuj za wcześnie.', luz: 0.7, kryt: 0.15 },
};
const DOMYSLNE_PROGI = { luz: 1.0, kryt: 0.301 };

function poprawneProgi(p) {
  return p && typeof p.luz === 'number' && typeof p.kryt === 'number' && p.kryt > 0 && p.luz > p.kryt;
}
function progiUzytkownika() {
  return profil && poprawneProgi(profil.progi) ? profil.progi : DOMYSLNE_PROGI;
}
/** Progi "od" dla: luz, spokojnie, pora, pilne (krytyczne = poniżej ostatniego). */
function progiPoziomow(p = progiUzytkownika()) {
  const krok = (p.luz - p.kryt) / 3;
  return [p.luz, p.luz - krok, p.luz - 2 * krok, p.kryt];
}
function proc(v) { return `${Math.round(v * 100)}%`; }
function opisProgu(klucz) {
  const [l, s, pr, pi] = progiPoziomow();
  return {
    luz: `co najmniej ${proc(l)} potrzebnego czasu`,
    spokojnie: `${proc(s)}–${proc(l)} potrzebnego czasu`,
    pora: `${proc(pr)}–${proc(s)} potrzebnego czasu`,
    pilne: `${proc(pi)}–${proc(pr)} potrzebnego czasu`,
    krytyczne: `mniej niż ${proc(pi)} potrzebnego czasu`,
  }[klucz];
}
function dniPrzyklad(v) { return String(Math.round(v * 10 * 10) / 10).replace('.', ','); }

function htmlSzablonuProgow(klucz, sz) {
  const pr = progiPoziomow(sz);
  const wiersze = POZIOMY.map((p, i) => `<tr><td><i class="kropka-kal ${p.klucz}"></i> ${p.nazwa}</td>
    <td>${i < 4 ? '≥ ' + proc(pr[i]) : '< ' + proc(pr[3])}</td></tr>`).join('');
  return `
    <button type="button" class="tabela-profil" data-akcja="wybierz-progi" data-szablon="${klucz}">
      <span class="tabela-naglowek">${sz.nazwa}</span>
      <span class="maly-tekst">${sz.opis}</span>
      <table class="tabela-progow">${wiersze}</table>
      <span class="maly-tekst">Zadanie na 10 dni: luz, gdy do terminu ≥ ${dniPrzyklad(sz.luz)} dni; krytycznie poniżej ${dniPrzyklad(sz.kryt)} dni.</span>
    </button>`;
}

const oknoProfil = document.getElementById('okno-profil');
let krokProfilu = { grupa: null, styl: null, krok: 1, punkty: null };

function poprawnePunkty(p) {
  return Array.isArray(p) && p.length === 3 && p.every(v => typeof v === 'number' && v > 0)
    && p[0] < p[1] && p[1] < p[2];
}
function formatH(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }

function htmlTabeli(punkty, i) {
  const wiersze = PUNKTY_DNI.map((d, k) => `<tr><td>${d === 1 ? '1 dzień' : d + ' dni'}</td><td><b>${formatH(punkty[k])} h</b></td></tr>`).join('');
  return `
    <button type="button" class="tabela-profil" data-akcja="wybierz-tabele" data-nr="${i}">
      <span class="tabela-naglowek">Wariant ${i + 1}</span>
      <table>${wiersze}</table>
      <span class="maly-tekst">np. 10 dni ≈ ${formatH(interpolujLog(10, PUNKTY_DNI, punkty))} h pracy</span>
    </button>`;
}

function rysujProfil() {
  const el = document.getElementById('profil-tresc');
  if (krokProfilu.krok === 3) {
    const teraz = progiUzytkownika();
    el.innerHTML = `
      <h2>Kiedy jest dla Ciebie luz, a kiedy krytycznie?</h2>
      <p class="maly-tekst">Intensywność zadania zależy od tego, jaka część potrzebnego czasu została do terminu.
        Każdy odczuwa to inaczej – wybierz, co do Ciebie pasuje.</p>
      <div class="tabele-profil">${Object.entries(SZABLONY_PROGOW).map(([k, sz]) => htmlSzablonuProgow(k, sz)).join('')}</div>
      <details class="wlasne-profil">
        <summary>Wpiszę własne progi</summary>
        <form id="form-progi" class="wlasne-pola progi-pola">
          <label class="pole"><span>Luz od (% potrzebnego czasu)</span>
            <input name="luz" type="number" min="1" step="1" value="${Math.round(teraz.luz * 100)}"></label>
          <label class="pole"><span>Krytycznie poniżej (%)</span>
            <input name="kryt" type="number" min="1" step="1" value="${Math.round(teraz.kryt * 100)}"></label>
          <button type="submit" class="przycisk glowny">Zapisz własne</button>
          <small class="podpowiedz" style="grid-column: 1 / -1">Pośrednie poziomy (spokojnie, pora zaczynać, pilne) dzielą ten przedział po równo.</small>
          <small class="blad" id="blad-progi"></small>
        </form>
      </details>
      <div class="okno-stopka">
        <button type="button" class="przycisk" data-akcja="wstecz-profil">← Wstecz</button>
        <span style="flex:1"></span>
        <button type="button" class="przycisk" data-akcja="wybierz-progi" data-szablon="zrownowazony">Pomiń (zrównoważony)</button>
      </div>`;
    return;
  }
  if (krokProfilu.krok === 1 || !krokProfilu.grupa) {
    el.innerHTML = `
      <h2>Dopasujmy plan do Ciebie</h2>
      <p class="maly-tekst">Szacujesz zadania w dniach (np. „kolokwium – 3 dni”). Żeby wiedzieć, ile to godzin czystej pracy,
        musimy wiedzieć, jak lubisz pracować. Jaką pracę lubisz?</p>
      <div class="style-wybor">
        ${Object.entries(STYLE).map(([k, s]) => `
          <button type="button" class="styl-przycisk" data-akcja="wybierz-styl" data-styl="${k}">
            <b>${s.nazwa}</b><span class="maly-tekst">${s.opis}</span>
          </button>`).join('')}
      </div>
      <div class="okno-stopka">
        ${profil ? '<button type="button" class="link" data-akcja="tylko-progi">Zmień tylko progi intensywności →</button>' : ''}
        <span style="flex:1"></span>
        <button type="button" class="przycisk" data-akcja="pomin-profil">Pomiń – użyj ustawień domyślnych</button>
      </div>`;
    return;
  }
  const styl = STYLE[krokProfilu.grupa];
  const wlasne = profil && profil.styl === 'wlasne' ? profil.punkty : punktyProfilu();
  el.innerHTML = `
    <h2>${styl.nazwa} – która tabelka pasuje do Ciebie?</h2>
    <p class="maly-tekst">Ile godzin czystej pracy to dla Ciebie zadanie oszacowane na 1 dzień, 3 dni i 30 dni?</p>
    <div class="tabele-profil">${styl.tabele.map(htmlTabeli).join('')}</div>
    <details class="wlasne-profil">
      <summary>Żadna nie pasuje – wpiszę własne liczby</summary>
      <form id="form-profil" class="wlasne-pola">
        ${PUNKTY_DNI.map((d, k) => `<label class="pole"><span>${d === 1 ? '1 dzień' : d + ' dni'} = ile h?</span>
          <input name="p${k}" type="number" min="0.1" step="0.1" value="${formatH(wlasne[k]).replace(',', '.')}"></label>`).join('')}
        <button type="submit" class="przycisk glowny">Zapisz własne</button>
        <small class="blad" id="blad-profil"></small>
      </form>
    </details>
    <div class="okno-stopka">
      <button type="button" class="przycisk" data-akcja="wstecz-profil">← Wstecz</button>
    </div>`;
}

function otworzProfil() {
  krokProfilu = { grupa: null, styl: null, krok: 1, punkty: null };
  rysujProfil();
  if (!oknoProfil.open) oknoProfil.showModal();
}
/** Krok 2 → 3: zapamiętujemy wybrane godziny i pytamy o progi intensywności. */
function zapiszProfil(styl, punkty) {
  krokProfilu = { ...krokProfilu, styl, punkty, krok: 3 };
  rysujProfil();
}
/** Krok 3: zapis całego profilu (godziny + progi). */
function zapiszProgi(progi) {
  const punkty = krokProfilu.punkty || punktyProfilu();
  const styl = krokProfilu.punkty ? krokProfilu.styl : (profil ? profil.styl : 'domyslne');
  profil = { styl, punkty, progi };
  zapiszLokalnie();
  oknoProfil.close();
  odswiez();
  powiadom(`Zapisano: 1 dzień ≈ ${formatH(punkty[0])} h, 30 dni ≈ ${formatH(punkty[2])} h · luz od ${proc(progi.luz)}, krytycznie poniżej ${proc(progi.kryt)} potrzebnego czasu.`);
}

oknoProfil.addEventListener('submit', e => {
  if (e.target.id === 'form-progi') {
    e.preventDefault();
    const f = new FormData(e.target);
    const progi = { luz: parseFloat(f.get('luz')) / 100, kryt: parseFloat(f.get('kryt')) / 100 };
    if (!poprawneProgi(progi)) {
      document.getElementById('blad-progi').textContent = 'Próg luzu musi być większy od progu krytycznego, oba większe od zera.';
      return;
    }
    zapiszProgi(progi);
    return;
  }
  if (e.target.id !== 'form-profil') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const punkty = [0, 1, 2].map(k => parseFloat(String(f.get('p' + k)).replace(',', '.')));
  if (!poprawnePunkty(punkty)) {
    document.getElementById('blad-profil').textContent = 'Podaj liczby większe od zera, rosnące: 1 dzień < 3 dni < 30 dni.';
    return;
  }
  zapiszProfil('wlasne', punkty);
});
// okna nie da się zamknąć klawiszem Esc przy pierwszym wejściu bez wyboru – wtedy liczymy jak "Pomiń"
oknoProfil.addEventListener('cancel', () => { if (!profil) { profil = { styl: 'domyslne', punkty: DOMYSLNE_PUNKTY.slice(), progi: { ...DOMYSLNE_PROGI } }; zapiszLokalnie(); odswiez(); } });

/* ---------- Dymek z uwagami ("!") ----------
   Ustawiamy go względem ekranu (position: fixed), żeby nie przycinało go
   okno szczegółów. Domyślnie nad wykrzyknikiem, a gdy brak miejsca – pod nim. */
function pokazDymek(uwaga) {
  const dymek = uwaga.querySelector('.uwaga-dymek');
  if (!dymek) return;
  dymek.style.display = 'block';
  const r = uwaga.getBoundingClientRect();
  const d = dymek.getBoundingClientRect();
  const margines = 8;
  let top = r.top - d.height - margines;
  if (top < margines) top = r.bottom + margines;                       // brak miejsca u góry → pod spodem
  top = Math.min(top, window.innerHeight - d.height - margines);
  let left = r.left + r.width / 2 - d.width / 2;
  left = Math.max(margines, Math.min(left, window.innerWidth - d.width - margines));
  dymek.style.top = `${Math.max(margines, top)}px`;
  dymek.style.left = `${left}px`;
}
function schowajDymek(uwaga) {
  const dymek = uwaga.querySelector('.uwaga-dymek');
  if (dymek) dymek.style.display = '';
}
document.addEventListener('mouseover', e => { const u = e.target.closest('.uwaga'); if (u) pokazDymek(u); });
document.addEventListener('mouseout', e => { const u = e.target.closest('.uwaga'); if (u && !u.contains(e.relatedTarget)) schowajDymek(u); });
document.addEventListener('focusin', e => { const u = e.target.closest('.uwaga'); if (u) pokazDymek(u); });
document.addEventListener('focusout', e => { const u = e.target.closest('.uwaga'); if (u) schowajDymek(u); });

/* =====================================================================
   Powiadomienia (z przyciskiem "Cofnij")
   ===================================================================== */
function powiadom(tekst, przycisk = null, akcja = null) {
  const pojemnik = document.getElementById('powiadomienia');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(tekst)}</span>`;
  if (przycisk && akcja) {
    const b = document.createElement('button');
    b.textContent = przycisk;
    b.onclick = () => { t.remove(); akcja(); };
    t.appendChild(b);
  }
  pojemnik.appendChild(t);
  while (pojemnik.children.length > 3) pojemnik.firstChild.remove();
  setTimeout(() => t.remove(), przycisk ? 6000 : 3500);
}

/* =====================================================================
   Obsługa kliknięć, filtrów, pliku
   ===================================================================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-akcja], [data-widok]');
  if (!el) {
    const dzien = e.target.closest('.dzien-kal[data-dzien]');
    if (dzien && tresc.contains(dzien)) otworzOknoDnia(dzien.dataset.dzien);
    return;
  }
  if (el.dataset.widok) {
    widok = el.dataset.widok;
    odswiez();
    window.scrollTo(0, 0);
    return;
  }
  const id = el.dataset.id !== undefined ? Number(el.dataset.id) : null;
  switch (el.dataset.akcja) {
    case 'nowe': otworzFormularz(null, el.dataset.data || null); break;
    case 'edytuj': if (oknoSzczegoly.open) oknoSzczegoly.close(); otworzFormularz(id); break;
    case 'usun': if (oknoSzczegoly.open) oknoSzczegoly.close(); usun(id); break;
    case 'szczegoly': pokazSzczegoly(id); break;
    case 'zamknij-szczegoly': oknoSzczegoly.close(); break;
    case 'grupuj': filtry.grupuj = el.dataset.wartosc; odswiez(); break;
    case 'pokaz-zrobione': filtry.pokazZrobione = el.checked; odswiez(); break;
    case 'zakres': terminarz.zakres = el.dataset.wartosc; terminarz.przesuniecie = 0; odswiez(); break;
    case 'przesun': terminarz.przesuniecie = el.dataset.wartosc === '0' ? 0 : terminarz.przesuniecie + Number(el.dataset.wartosc); odswiez(); break;
    case 'pokaz-sesje': terminarz.pokazSesje = el.checked; odswiez(); break;
    case 'odhacz': przelaczWykonane(id); break;
    case 'sesja': przelaczSesje(id, el.dataset.data, el.dataset.h); break;
    case 'wczytaj': document.getElementById('plik').click(); break;
    case 'zapisz': zapiszDoPliku(); break;
    case 'anuluj': okno.close(); break;
    case 'zamknij-dzien': oknoDnia.close(); break;
    case 'profil': otworzProfil(); break;
    case 'wybierz-styl': krokProfilu.grupa = el.dataset.styl; krokProfilu.krok = 2; rysujProfil(); break;
    case 'wstecz-profil':
      krokProfilu.krok = krokProfilu.krok === 3 && krokProfilu.grupa ? 2 : 1;
      if (krokProfilu.krok === 1) krokProfilu = { grupa: null, styl: null, krok: 1, punkty: null };
      rysujProfil(); break;
    case 'tylko-progi': krokProfilu = { grupa: null, styl: null, krok: 3, punkty: null }; rysujProfil(); break;
    case 'wybierz-progi': { const sz = SZABLONY_PROGOW[el.dataset.szablon]; zapiszProgi({ luz: sz.luz, kryt: sz.kryt }); break; }
    case 'wybierz-tabele': zapiszProfil(krokProfilu.grupa, STYLE[krokProfilu.grupa].tabele[Number(el.dataset.nr)].slice()); break;
    case 'pomin-profil': krokProfilu = { styl: 'domyslne', punkty: DOMYSLNE_PUNKTY.slice(), krok: 3 }; zapiszProgi({ ...DOMYSLNE_PROGI }); break;
    case 'przywroc-dzien': przywrocDni(el.dataset.data); break;
  }
});

tresc.addEventListener('input', e => {
  const k = e.target.dataset.filtr;
  if (!k) return;
  filtry[k] = e.target.value;
  odswiez();
});

document.getElementById('plik').addEventListener('change', e => {
  const plik = e.target.files[0];
  if (plik) wczytajZPliku(plik);
  e.target.value = '';
});

// Przeciągnij i upuść plik JSON na okno
const upuszczanie = document.getElementById('upuszczanie');
let licznikDrag = 0;
window.addEventListener('dragenter', e => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  licznikDrag++;
  upuszczanie.hidden = false;
});
window.addEventListener('dragleave', () => {
  licznikDrag = Math.max(0, licznikDrag - 1);
  if (!licznikDrag) upuszczanie.hidden = true;
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  licznikDrag = 0;
  upuszczanie.hidden = true;
  const plik = e.dataTransfer?.files?.[0];
  if (plik) wczytajZPliku(plik);
});

// Skrót klawiszowy: "n" = nowe zadanie
document.addEventListener('keydown', e => {
  if (e.key === 'n' && !okno.open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    otworzFormularz();
  }
});

/* =====================================================================
   Start
   ===================================================================== */
if (!wczytajLokalnie() && window.PRZYKLADOWE_DANE) {
  dane = normalizuj(window.PRZYKLADOWE_DANE).dane;
  zapiszLokalnie();
}
// Sprzątanie: powtórki, których egzamin już nie istnieje (np. usunięty wcześniej
// tryb sesji), nie mają sensu – usuwamy je z danych zapisanych w przeglądarce.
(() => {
  const egzaminy = new Set(dane.zadania.filter(czyEgzamin).map(e => e.tytul));
  const sieroty = dane.zadania.filter(z => czyPowtorka(z) && !egzaminy.has(z.tytul.split(' – ').slice(1).join(' – ')));
  if (!sieroty.length) return;
  const ids = new Set(sieroty.map(z => z.id));
  dane.zadania = dane.zadania.filter(z => !ids.has(z.id));
  for (const id of ids) delete sesje[id];
  zapiszLokalnie();
  setTimeout(() => powiadom(`Usunięto ${sieroty.length} powtórek, których egzamin już nie istnieje.`), 300);
})();
odswiez();
if (!profil) otworzProfil();   // pierwsze wejście – pytamy o styl pracy
