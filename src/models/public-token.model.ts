interface InstanceServer {
  endpoint: string;
  protocol: string;
  encrypt: boolean;
  pingInterval: number;
  pingTimeout: number;
}

interface PublicTokenData {
  token: string;
  instanceServers: InstanceServer[];
}

export interface PublicToken {
  code: string;
  data: PublicTokenData;
}
