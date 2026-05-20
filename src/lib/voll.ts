// Campanhas Voll WhatsApp
// Para adicionar novas campanhas, basta incluir um novo item nesse array.
// api_key e campaign_id são compartilhados — só o hsmId muda por campanha.

export interface VollCampaign {
  id: string;       // slug interno
  name: string;     // nome exibido no dropdown
  hsmId: string;    // media_hsm_configuration_id
}

export const VOLL_CAMPAIGNS: VollCampaign[] = [
  {
    id: "carrinho-abandonado",
    name: "Carrinho Abandonado",
    hsmId: "ef42dd48-7c9b-4953-a323-de2cdcfc82f1",
  },
  {
    id: "continuidade-atendimento",
    name: "Continuidade de Atendimento",
    hsmId: "b5460280-ff46-47d7-9ddd-4df8176e6695",
  },
];

export function getCampaignById(id: string): VollCampaign | undefined {
  return VOLL_CAMPAIGNS.find((c) => c.id === id);
}

export const DEFAULT_CAMPAIGN = VOLL_CAMPAIGNS[0];
