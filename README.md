# 🛴 hulajboom – Planner studenta

Planner zadań (to-do) dla studenta, zadanie eliminacyjne w kategorii **SmartApp**.
Nie jest to tylko lista: aplikacja **sama planuje, kiedy i ile pracować**, dopasowuje się do stylu pracy użytkownika i rozkłada naukę zgodnie z **krzywą zapominania Ebbinghausa**.

> Aplikacja działa w całości w przeglądarce (HTML + CSS + JavaScript, bez bibliotek i bez serwera).

---

## 1. Jak uruchomić

1. Pobierz repozytorium: **Code → Download ZIP** (i rozpakuj) albo `git clone https://github.com/kerdej1/hulajboom.git`.
2. Otwórz plik **`index.html`** w przeglądarce (Chrome, Firefox, Edge, Safari).

Nie trzeba nic instalować ani uruchamiać serwera. Przy pierwszym uruchomieniu wczytują się przykładowe zadania (`przyklad.js` – kopia `zadania.json`), a aplikacja zapyta o Twój styl pracy (można pominąć).

**Wczytanie własnego pliku:** przycisk **„Wczytaj JSON”** albo przeciągnięcie pliku na stronę.
**Zapis:** przycisk **„Zapisz JSON”** – pobiera plik `zadania.json` w tym samym formacie.
**Czysty start:** przycisk **„Wyczyść”** (z możliwością cofnięcia).

<!-- Opcjonalnie: GitHub Pages → link do działającej wersji online -->

Do testów można „przestawić” dzisiejszą datę: `index.html?dzis=2026-11-20`.

---

## 2. Co działa

### Wymagania z zadania – wszystkie 7 punktów

| # | Wymaganie | Jak |
|---|---|---|
| 1 | Lista zadań | zakładka **Wszystkie zadania** (kolumny z kafelkami) i **Terminarz** (kalendarz) |
| 2 | Dodawanie | **+ Nowe zadanie** lub „+ Dodaj” w konkretnym dniu kalendarza |
| 3 | Edycja | kliknięcie zadania → **Edytuj** |
| 4 | Wykreślanie jako zrobione i cofanie | kółko przy zadaniu / przycisk w szczegółach, „Cofnij” w powiadomieniu |
| 5 | Usuwanie | w szczegółach zadania (z „Cofnij”) |
| 6 | Wczytanie z JSON | **Wczytaj JSON** / przeciągnij plik |
| 7 | Zapis do JSON w tym samym formacie | **Zapisz JSON** – te same pola, w tej samej kolejności |

**Format pliku jest zachowany.** Sprawdziliśmy to automatycznym testem: wczytanie pliku i ponowny zapis daje identyczny plik (także dla minimalnego przykładu z treści zadania). Plik z błędami (np. brak tytułu, zły priorytet, niepoprawna data, powtórzone `id`) nie wywraca aplikacji – wartości są poprawiane, a ostrzeżenia trafiają do konsoli.

Dodatkowe informacje, dla których format nie ma pól, zapisujemy jako **ukryte tagi** w istniejącej liście `tagi` (nie są pokazywane jako zwykłe tagi):

| Tag | Znaczenie |
|---|---|
| `⏱10d` | czas na spokojne zrobienie: 10 dni |
| `⏱12h` | godziny czystej pracy wpisane ręcznie |
| `okresowe` | zadanie okresowe (siłownia, zakupy…) |
| `akcja` | jednorazowa akcja 🛴 (np. zakup pralki) |

Plik bez tych tagów (np. plik jury) działa normalnie – czas pracy jest wtedy szacowany automatycznie na podstawie ważności.

### Widoki

- **Terminarz** – kalendarz od poniedziałku: **tydzień / 2 tygodnie / miesiąc**, strzałki i przycisk „Dziś”. Im więcej dni, tym mniejsze kratki; w widoku miesiąca zadania są kropkami w kolorze intensywności (okresowe – szare kwadraty, akcje – 🛴). Kratka po najechaniu lekko się powiększa.
- **Wszystkie zadania** – kolumny z kafelkami **wg intensywności** albo **wg ważności**, wyszukiwarka, filtr tagów, „pokaż zrobione”. Kliknięcie kafelka otwiera szczegóły.
- **Legenda** pod przyciskiem „ⓘ Legenda”.

---

## 3. Co dodaliśmy od siebie i dlaczego

Zwykła lista zadań mówi, **co** trzeba zrobić. Student najczęściej nie wie, **kiedy zacząć i ile tego naprawdę jest** – kolokwium „za tydzień” wydaje się odległe, dopóki nie okaże się, że potrzeba na nie 3 dni nauki. Dlatego wszystkie nasze pomysły kręcą się wokół jednego: **zamienić termin w plan pracy**.

### 3.1. Dwa priorytety: ważność i intensywność
Pole `priorytet` z pliku to **ważność** – ile zadanie znaczy. Osobno liczymy **intensywność** – jak bardzo goni czas. Każde zadanie ma szacowany czas na **spokojne** zrobienie (np. projekt – 30 dni), a aplikacja liczy:

> **intensywność = dni do terminu ÷ pozostała praca**

i przypisuje jeden z 5 poziomów: 🟢 Luz → 🟡 Spokojnie → 🟠 Pora zaczynać → 🔴 Pilne → 🟣 Krytyczne.
Dzięki temu projekt za 3 tygodnie może być już krytyczny, a zakupy za 2 dni to luz. Kolor intensywności jest wszędzie (kalendarz, kafelki, kropki), a ważność to znaczki !!! / !! / !.

**Dlaczego:** sama data nie mówi, czy zdążysz – liczy się stosunek czasu do ilości pracy. Do tego „ważne” i „pilne” to dwie różne rzeczy: zaliczenie może być bardzo ważne, ale jeszcze niepilne, a zakupy pilne, choć mało ważne. Rozdzielenie tych osi pozwala zdecydować, czym zająć się dziś, a co spokojnie zaplanować.

### 3.2. Plan sesji pracy
Aplikacja rozkłada pracę na **sesje** przed terminem i pokazuje je w kalendarzu (np. „Nauka 2/6 · 2 h”). Gdy czasu jest mniej niż na spokojne tempo, sesje się **wydłużają**, a uwaga pod znaczkiem „!” mówi, że trzeba przyspieszyć. Pominięta sesja nie przepada – plan liczy się na nowo każdego dnia. Odhaczone sesje zmniejszają pozostałą pracę.

Zasady oparte na badaniach (uproszczone):
- **nauka + 3 powtórki** jako minimum przy uczeniu się (successive relearning – Rawson i Dunlosky 2011, 2022),
- **sesje nauki do ok. 2 h, max ok. 4 h dziennie** na zadanie – powyżej korzyści maleją (Ericsson, Krampe, Tesch-Römer 1993),
- **najwyżej jedna sesja dziennie na zadanie** – sen między sesjami pomaga (Mazza i in. 2016),
- **przerwy między sesjami** rosnące, ostatnia sesja dzień przed terminem (Cepeda i in. 2008).

**Dlaczego:** samo „termin za 10 dni” nie mówi, co zrobić dziś. Student potrzebuje konkretu: *dziś 2 h nauki do kolokwium*. Plan, który sam się przelicza po pominiętym dniu, zdejmuje z głowy ciągłe układanie wszystkiego od nowa – a uwaga „musisz wydłużyć sesje” ostrzega, zanim zrobi się za późno.

### 3.3. Krzywa zapominania Ebbinghausa
Przy zadaniach, w których się uczymy (egzaminy, kolokwia, testy), dni sesji wybiera model pamięci **R = e^(−t/S)**: każda sesja przywraca pamięć do 100% i zwiększa jej „stabilność” S – tym bardziej, im więcej zdążyliśmy zapomnieć. Aplikacja sprawdza wiele rozkładów i wybiera ten, po którym w dniu terminu zapamiętasz najwięcej, a w szczegółach pokazuje **przewidywane zapamiętanie** (🧠 np. „ok. 92% w dniu terminu”).
Przykład z modelu: 5 rozłożonych sesji ≈ 97%, jedna długa sesja dzień przed ≈ 51%.

**Do czego służy krzywa Ebbinghausa:** pamięć spada najszybciej zaraz po nauce, a każda powtórka spowalnia zapominanie. Dlatego **nie jest obojętne, w które dni się uczysz** – te same godziny dają dużo więcej, gdy są rozłożone z rosnącymi przerwami, niż gdy są zbite w jeden wieczór. Krzywa pozwala aplikacji:
1. **wybrać dni sesji nauki** tak, żeby w dniu kolokwium / egzaminu pamiętać jak najwięcej,
2. **pokazać to liczbą** (🧠 przewidywane zapamiętanie), żeby było widać, co daje dobry plan, a co zakuwanie.

**Dlaczego:** najczęstszy błąd studenta to „zakuwanie” na ostatnią chwilę. Wiele osób wie, że to nieskuteczne, ale nie widzi, o ile – chcieliśmy, żeby aplikacja to policzyła i od razu ułożyła lepszy plan.

### 3.4. Plan dopasowany do człowieka
Przy pierwszym wejściu aplikacja pyta:
1. **Jaką pracę lubisz** – mało intensywną / intensywną / bardzo intensywną,
2. **która tabelka do Ciebie pasuje** – ile godzin czystej pracy to zadanie na 1 dzień, 3 dni i 30 dni (albo własne liczby); przez te punkty prowadzimy krzywą (kawałki krzywej potęgowej), która przelicza dni ↔ godziny,
3. **kiedy jest dla Ciebie luz, a kiedy krytycznie** – 3 szablony (Ostrożny / Zrównoważony / Na ostatnią chwilę) albo własne progi.

W formularzu zadania dni i godziny podpowiadają się nawzajem wg tej krzywej, ale to tylko sugestia – można wpisać np. 100 dni i 10 h. Ustawienia można zmienić w **⚙ Mój styl pracy** (wybrane opcje są zaznaczone).

**Dlaczego:** „3 dni” dla jednej osoby to 6 h, dla innej 15 h. Bez tego każdy plan byłby dobry tylko dla jednego typu studenta.

### 3.5. Wykreślanie dni (wakacje, wyjazd, choroba)
Kliknięcie pustego miejsca w dniu kalendarza pozwala go **wykreślić** (z powodem, także kilka dni naraz). Wykreślone dni nie liczą się jako czas na pracę – plan się **kompresuje**, a intensywność rośnie.

**Dlaczego:** „zostały 3 tygodnie” to często złudzenie – w środku jest wyjazd do domu, święta albo inne kolokwium. Plan, który tego nie wie, jest zbyt optymistyczny. Po wykreśleniu dni od razu widać, że trzeba zacząć wcześniej.

### 3.6. Rodzaje zadań
- **↻ Okresowe** (siłownia, zakupy, opłaty) – bez priorytetu i planowania, szare.
- **🛴 Jednorazowe akcje** (np. zakup pralki) – bez priorytetu i czasu pracy, z hulajnogą – naszym znakiem rozpoznawczym.

**Dlaczego:** nie każde zadanie wymaga planowania nauki. Gdyby siłownia czy kupno zmywarki dostawały „godziny pracy” i poziomy intensywności, zaśmiecałyby plan i fałszowały obraz obciążenia. Osobne rodzaje sprawiają, że codzienne sprawy są widoczne w kalendarzu, ale nie przeszkadzają w planowaniu tego, co naprawdę wymaga czasu.

### 3.7. Zaległe zadania w dwóch miejscach
Zaległe zadanie zostaje w dniu swojego terminu („⚠ nie zrobione w terminie”), a w dzisiejszym dniu pojawia się jego półprzezroczysta kopia („↪ zaległe z 18 lis · 2 dni temu”).

**Dlaczego:** przeniesienie zaległego zadania na „dziś” ukrywa, że coś się przesunęło; zostawienie go tylko w przeszłości sprawia, że łatwo o nim zapomnieć. Pokazujemy jedno i drugie.

### 3.8. Drobniejsze rzeczy
- „Cofnij” po usunięciu, odhaczeniu, wczytaniu pliku i wyczyszczeniu kalendarza,
- usunięcie zadania usuwa też jego plan (sesje, powtórki egzaminu),
- autozapis w przeglądarce, wersja na telefon, skrót klawiszowy **N** – nowe zadanie,
- minimalistyczna szata graficzna z kolorem tylko tam, gdzie niesie informację,
- legenda pod przyciskiem „ⓘ Legenda”.

**Dlaczego:** student korzysta z plannera w biegu – pomyłkowe kliknięcie nie może kosztować utraty danych, a ekran nie może być przeładowany, żeby od razu było widać, co jest najważniejsze.

---

## 4. Czego nie zdążyliśmy / ograniczenia

### Pomysły, których nie zdążyliśmy dodać
1. **Zadania okresowe, które naprawdę się powtarzają** – np. „co tydzień w poniedziałek i czwartek”; po odhaczeniu automatycznie tworzyłoby się kolejne. Teraz „okresowe” to tylko oznaczenie (bez priorytetu i planu).
2. **Aplikacja ucząca się od użytkownika** – po każdej sesji pytanie „ile faktycznie pracowałeś?” i automatyczna korekta krzywej dni → godziny z ankiety stylu pracy. Szacunki stawałyby się z czasem coraz trafniejsze.
3. **Dodawanie zadań zwykłym zdaniem** – np. „kolos z fizyki w piątek, ok. 3 dni nauki” → wypełniony formularz (prostym rozpoznawaniem słów albo z pomocą AI).

### Ograniczenia
- **Postęp, dni wykreślone i styl pracy są zapisywane tylko w przeglądarce** (`localStorage`), a nie w pliku JSON – świadomie, żeby nie zmieniać formatu sprawdzanego przez jury. Na innym komputerze trzeba je ustawić od nowa. Czas pracy i rodzaje zadań są w pliku (ukryte tagi).
- **Tryb sesji egzaminacyjnej** (osobna zakładka z formularzem egzaminu, długością powtórek w min / h / dniach i automatycznymi powtórkami) – zrobiliśmy go, ale ostatecznie usunęliśmy z interfejsu, bo dublował się z planowaniem nauki. Zadania z tagami `egzamin` / `powtórka` są nadal obsługiwane.
- **Powtórki są łączone z egzaminem po tytule** (`Powtórka 2/5 – <tytuł egzaminu>`) – zmiana tytułu egzaminu zrywa to powiązanie.
- **Model pamięci i krzywe godzin to uproszczenia.** Kierunek wynika z badań, ale konkretne parametry (np. stabilność początkowa, progi 2 h / 4 h, tabelki stylów) dobraliśmy sami – procent zapamiętania jest orientacyjny.
- Gdy użytkownik sam wpisze czas pracy, w jego zadaniu pojawia się ukryty tag (`⏱…`) – to wciąż poprawny format, ale lista `tagi` zawiera wtedy dodatkowy element.

---

## 5. Źródła

- Ebbinghaus, H. (1885). *Über das Gedächtnis.*
- Cepeda, N. J. i in. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science.*
- Rawson, K. A., Dunlosky, J. (2011, 2022). Successive relearning. *Journal of Experimental Psychology: General; Current Directions in Psychological Science.*
- Ericsson, K. A., Krampe, R. T., Tesch-Römer, C. (1993). The role of deliberate practice in the acquisition of expert performance. *Psychological Review.*
- Mazza, S. i in. (2016). Relearn faster and retain longer: Along with practice, sleep makes perfect. *Psychological Science.*
- Rohrer, D., Pashler, H. (2007). Increasing retention without increasing study time. *Current Directions in Psychological Science.*
