# 🛴 hulajboom – Planner studenta

Planner zadań dla studenta (zadanie eliminacyjne, kategoria **SmartApp**).
To nie jest zwykła lista: aplikacja **sama planuje, kiedy i ile pracować**, dopasowuje się do tego, jak pracuje konkretna osoba, i układa naukę zgodnie z **krzywą zapominania Ebbinghausa**.

## 1. Jak uruchomić

1. Pobierz repozytorium (**Code → Download ZIP**) albo `git clone https://github.com/kerdej1/hulajboom.git`.
2. Otwórz **`index.html`** w przeglądarce.

Bez instalacji i bez serwera (HTML + CSS + JavaScript). Przy pierwszym uruchomieniu wczytują się przykładowe zadania, a aplikacja zapyta o Twój styl pracy (można pominąć).
Pliki: **Wczytaj JSON** (lub przeciągnij plik na stronę), **Zapisz JSON**, **Wyczyść** – wszystko z możliwością cofnięcia.

## 2. Co działa

Wszystkie 7 wymagań: lista zadań, dodawanie, edycja, odhaczanie (i cofanie), usuwanie, wczytanie i zapis JSON.

**Format pliku jest zachowany** – wczytanie i ponowny zapis dają identyczny plik (sprawdzone testem, także na minimalnym przykładzie z treści zadania). Błędne wartości w pliku są poprawiane, a nie wywracają aplikacji. Informacje, dla których format nie ma pól, zapisujemy jako **ukryte tagi** w istniejącej liście `tagi`: `⏱10d` (czas na spokojne zrobienie), `⏱12h` (godziny wpisane ręcznie), `okresowe`, `akcja`. Plik bez nich działa normalnie.

**Widoki:** **Terminarz** (tydzień / 2 tygodnie / miesiąc – im więcej dni, tym mniejsze kratki, w miesiącu kolorowe kropki) i **Wszystkie zadania** (kafelki w kolumnach wg intensywności albo ważności). Kliknięcie zadania otwiera szczegóły; znaczenie kolorów pod przyciskiem **ⓘ Legenda**.

## 3. Co dodaliśmy od siebie i dlaczego

Lista zadań mówi, **co** trzeba zrobić. Student najczęściej nie wie, **kiedy zacząć i ile tego naprawdę jest**. Dlatego wszystkie nasze pomysły służą jednemu: **zamienić termin w konkretny plan pracy, dopasowany do człowieka**.

Każdy z tych pomysłów to nasza koncepcja, a ich zasady opieramy na badaniach nad uczeniem się i pamięcią (źródła na końcu). Badania wyznaczają kierunek, a konkretne liczby w modelu to nasze uproszczenia – wyniki traktujemy więc jako dobrą wskazówkę, a nie pomiar.

### 3.1. Funkcja pracy dopasowana do każdego użytkownika
Ten sam „3-dniowy” temat dla jednej osoby to 4 h nauki, dla innej 20 h. Dlatego przy pierwszym wejściu pytamy, **jaką pracę lubisz** (mało / średnio / bardzo intensywną), a potem prosimy o wybór tabelki: ile godzin czystej pracy to dla Ciebie zadanie na 1, 3 i 30 dni (albo własne liczby). W każdym stylu są 3 tabelki ułożone **od najlżejszej do najcięższej**, a style na siebie nie zachodzą (np. intensywna: od 3 / 7,5 / 37,5 h do 4 / 11 / 60 h). Przez te punkty prowadzimy **indywidualną krzywą dni ↔ godziny** – każdy użytkownik dostaje własną funkcję, według której liczony jest jego plan. Pytamy też, **kiedy jest dla Ciebie luz, a kiedy krytycznie** (3 szablony albo własne progi) i **ile najwięcej godzin dziennie możesz pracować** (domyślnie 12 h). W formularzu dni i godziny podpowiadają się nawzajem wg tej funkcji, ale zawsze można wpisać własne wartości.

### 3.2. Dwa priorytety: ważność i intensywność
Pole `priorytet` to **ważność** (!!! / !! / !). Osobno liczymy **intensywność**, czyli jak bardzo goni czas:

> **intensywność = dni do terminu ÷ pozostała praca**

5 poziomów: 🟢 Luz → 🟡 Spokojnie → 🟠 Pora zaczynać → 🔴 Pilne → 🟣 Krytyczne. Projekt za 3 tygodnie może być już krytyczny, a zakupy za 2 dni to luz. „Ważne” i „pilne” to co innego – rozdzielenie ich pomaga zdecydować, czym zająć się dziś.

### 3.3. Plan sesji oparty na badaniach
Aplikacja rozkłada pracę na **sesje** w kalendarzu (np. „Nauka 2/4 · 2 h”) i przelicza plan codziennie – pominięta sesja nie przepada. Gdy czasu jest mało, sesje się wydłużają, a znaczek „!” ostrzega, że trzeba przyspieszyć. Zasady:
- nauka + **3 powtórki** jako minimum (successive relearning – Rawson i Dunlosky),
- sesja nauki do ok. **2 h**, ponad **4 h dziennie** – ostrzeżenie (Ericsson, Krampe, Tesch-Römer),
- najwyżej **jedna sesja dziennie** na zadanie – sen między sesjami utrwala wiedzę (Mazza i in.),
- **rosnące przerwy** między sesjami (Cepeda i in.).

**Plan wszystkich zadań naraz – dzienny limit.** Nawet ktoś, kto lubi intensywną pracę, nie przerobi kilku dni pod rząd po 18 h, gdy dwa przedmioty wypadną w tym samym czasie. Dlatego plan układamy wspólnie dla wszystkich zadań: w jednym dniu łącznie najwyżej tyle godzin, ile wynosi **limit** (domyślnie 12 h, do zmiany w „⚙ Mój styl pracy”). Czas dostają najpierw **ważniejsze** zadania (!!! → !! → !), przy tej samej ważności – te z bliższym terminem. Reszta przesuwa się na inne wolne dni przed swoim terminem, a gdy i tak się nie mieści, „!” mówi, ilu godzin brakuje. Pojedyncza sesja też nigdy nie przekracza limitu. Sesje jednego zadania mogą mieć wtedy różną długość, więc w planie przy **każdym dniu** jest małym drukiem jej czas (np. „dziś 45 min · wt., 24 lis 10 h”).

### 3.4. Krzywa zapominania Ebbinghausa – nasz sposób na „zakuwanie”
Pamięć spada najszybciej zaraz po nauce, a każda powtórka spowalnia zapominanie (model **R = e^(−t/S)**). Wykorzystaliśmy to na dwa sposoby:
1. przy nauce (kolokwia, egzaminy) aplikacja **wybiera dni sesji tak, żeby w dniu terminu pamiętać jak najwięcej**,
2. pokazuje **przewidywane zapamiętanie** 🧠 – np. te same 10 h nauki: 5 sesji rozłożonych w czasie ≈ 97%, jedna sesja przed egzaminem ≈ 51%.

Wielu studentów wie, że zakuwanie nie działa, ale nie widzi, o ile – chcieliśmy to pokazać liczbą i od razu ułożyć lepszy plan.

### 3.5. Pozostałe pomysły
- **Wykreślanie dni** (wakacje, wyjazd) – kliknięcie pustego miejsca w dniu; wykreślone dni nie liczą się jako czas na pracę, więc plan się kompresuje, a intensywność rośnie. „Zostały 3 tygodnie” to często złudzenie.
- **Rodzaje zadań:** ↻ okresowe (siłownia, zakupy) i 🛴 jednorazowe akcje (np. zakup pralki) – bez priorytetu i planu, żeby codzienne sprawy nie zaśmiecały planu nauki.
- **Zaległe zadania w dwóch miejscach** – w dniu terminu („nie zrobione w terminie”) i dziś jako półprzezroczysta kopia, żeby nic nie znikało z oczu.
- **„Cofnij”** po każdej ważnej operacji, autozapis, wersja na telefon, minimalistyczny wygląd z kolorem tylko tam, gdzie niesie informację.

## 4. Czego nie zdążyliśmy / ograniczenia

**Pomysły na rozwój:**
1. **Zadania okresowe, które się powtarzają** – np. co tydzień w pon. i czw.; teraz „okresowe” to tylko oznaczenie.
2. **Aplikacja ucząca się od użytkownika** – po sesji pytanie „ile faktycznie pracowałeś?” i automatyczna korekta jego indywidualnej funkcji.
3. **Dodawanie zadań zwykłym zdaniem** – np. „kolos z fizyki w piątek, ok. 3 dni nauki” → wypełniony formularz.
4. **Zakładka „Projekty”** – większy cel rozbity na kroki. Np. *egzamin z matematyki dyskretnej* → research, temat 1, temat 2… połączony z terminarzem (sesja pokazuje, którym krokiem się zająć), albo *wycieczka do Egiptu* → mieszkanie, loty, klapki… jako niezależna lista kroków z postępem.
5. **Statystyki postępu** – ile zadań i godzin pracy załatwiłem dziś i w tym tygodniu, jak często realizuję zaplanowane sesje, jak trafne były moje szacunki czasu, które dni tygodnia są najbardziej produktywne. Statystyki pomagałyby też aplikacji lepiej planować (np. przez korektę funkcji pracy z punktu 2).
6. **Plany długoterminowe i szablony** – np. **plan 12-tygodniowy** (cel na semestr rozbity na tygodnie, z tygodniowym podsumowaniem) oraz gotowe **szablony** do szybkiego startu: „sesja egzaminacyjna”, „projekt zaliczeniowy”, „nauka języka”, „przeprowadzka”… Szablon tworzyłby od razu zestaw zadań lub kroków projektu z sensownym czasem pracy.

**Ograniczenia:**
- Odhaczone sesje, dni wykreślone i styl pracy są zapisywane **tylko w przeglądarce** (żeby nie zmieniać formatu JSON) – na innym komputerze trzeba je ustawić od nowa.
- Parametry modelu (np. stabilność pamięci, progi 2 h / 4 h, tabelki stylów) to nasze uproszczenia – procent zapamiętania jest orientacyjny.
- Przy dziennym limicie pierwszeństwo ma ważność, więc ważne zadanie z dalekim terminem może zająć dni, których potrzebuje mniej ważne, ale pilniejsze zadanie – aplikacja wtedy ostrzega „!”. Mądrzejsze rozdzielanie (ważne zadanie ustępuje najbliższe dni i bierze późniejsze) to pomysł na rozwój.
- Gdy użytkownik sam wpisze czas pracy, w `tagi` pojawia się ukryty tag (`⏱…`) – format pozostaje poprawny.

## 5. Źródła

- Ebbinghaus, H. (1885). *Über das Gedächtnis.*
- Cepeda, N. J. i in. (2008). Spacing effects in learning. *Psychological Science.*
- Rawson, K. A., Dunlosky, J. (2011, 2022). Successive relearning. *J. Exp. Psych.: General; Current Directions in Psychological Science.*
- Ericsson, K. A., Krampe, R. T., Tesch-Römer, C. (1993). Deliberate practice. *Psychological Review.*
- Mazza, S. i in. (2016). Relearn faster and retain longer. *Psychological Science.*
- Rohrer, D., Pashler, H. (2007). Increasing retention without increasing study time. *Current Directions in Psychological Science.*
