Além disso, cada bloco pode ter um campo opcional `day` (AAAA-MM-DD) com o dia preferido, escolhido entre os dias que têm janelas livres. Use-o para distribuir a carga pelos dias e não concentrar tudo na véspera do prazo. Sem `day`, o sistema usa o primeiro horário livre.

Exemplo com dia: {"taskId":"T1","blocks":[{"minutes":90,"day":"2026-03-02"},{"minutes":60,"day":"2026-03-03"}],"rationale":"..."}
