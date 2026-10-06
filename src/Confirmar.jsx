import { Bar, Button, Dialog, Text } from '@ui5/webcomponents-react';

// confirmação de ação destrutiva (no lugar do confirm() do navegador): { texto, botao, sim }
export default function Confirmar({ pergunta, onFechar }) {
  if (!pergunta) return null;
  return (
    <Dialog open headerText="Confirmar" initialFocus="confirmar-nao" state="Negative" onClose={onFechar} className="confirmar"
      footer={<Bar design="Footer" endContent={<>
        <Button design="Negative" onClick={() => { onFechar(); pergunta.sim(); }}>{pergunta.botao}</Button>
        <Button id="confirmar-nao" design="Transparent" onClick={onFechar}>Cancelar</Button>
      </>} />}>
      <Text>{pergunta.texto}</Text>
    </Dialog>
  );
}
