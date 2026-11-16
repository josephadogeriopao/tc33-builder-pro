/// <reference types="vite/client" />

import { DesktopAPI } from "../shared/types";


declare global {
  interface Window {
    api: DesktopAPI
  }
}


