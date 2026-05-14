# Binario Reboot - Rift Rail

Rinnovamento totale di **Binario - The Game**: il progetto abbandona la vecchia impostazione a commessa statica e passa a un’identità **neon arcade-operativa**, con run a checkpoint, dashboard Rift e ricompense immediate.

## Nuova direzione

- **Interfaccia completamente rifatta**: splash dark/neon, griglia tecnica, card traslucide, badge Rift Rail e CTA orientate al reboot.
- **Menu a run**: il vecchio feed viene trasformato in una selezione di distretti, con crew personalizzabile e promessa di espansioni a zone.
- **Gameplay reinterpretato**: le fasi diventano checkpoint di una run: scan, hub, break ballast, recupero asset, drop, lock, stabilizzazione e upload QA.
- **HUD da missione arcade**: oltre ai KPI tecnici, il pannello mostra reputazione, crediti e timer della run.
- **Feedback più rapido**: ogni checkpoint completato assegna reputazione/crediti e aggiorna subito la mappa zone.

## Ciclo di gioco attuale

1. Avvia la run dal menu Rift Rail.
2. Scansiona il beacon iniziale.
3. Attiva l’hub operativo.
4. Usa la classe Breaker per demolire e caricare ballast.
5. Usa la classe Logistica per recuperare l’asset vecchio e droppare il nuovo modulo.
6. Chiudi i lock manuali sulla linea.
7. Usa la classe Stabilizer per consolidare il tracciato.
8. Completa l’upload QA e conquista la zona.

## Avvio locale

Apri `index.html` in un browser moderno oppure servi la cartella con un server statico:

```bash
python3 -m http.server 8000
```

Poi visita `http://localhost:8000`.
