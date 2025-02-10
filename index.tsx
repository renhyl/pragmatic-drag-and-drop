import React from 'react'
import Example from './src/example'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Example />
    </StrictMode>
)
