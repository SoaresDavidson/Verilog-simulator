import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ratioBounds } from './ratio'
import { SplitPane } from './SplitPane'

function mockSize(width: number, height: number) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

function renderPane(props: Partial<Parameters<typeof SplitPane>[0]> = {}) {
  return render(
    <SplitPane first={<p>A</p>} second={<p>B</p>} separatorLabel="Redimensionar" minFirst={100} minSecond={100} {...props} />,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('ratioBounds', () => {
  it('converte mínimos em frações e trava quando não cabem', () => {
    expect(ratioBounds(1000, 100, 200)).toEqual({ min: 0.1, max: 0.8 })
    expect(ratioBounds(150, 100, 100)).toEqual({ min: 0.5, max: 0.5 })
    expect(ratioBounds(0, 100, 100)).toEqual({ min: 0, max: 1 })
  })
})

describe('SplitPane', () => {
  it('expõe o divisor acessível e altera a proporção pelo teclado respeitando os mínimos', () => {
    mockSize(1000, 600)
    const onRatioChange = vi.fn()
    renderPane({ onRatioChange })
    const sep = screen.getByRole('separator', { name: 'Redimensionar' })
    expect(sep).toHaveAttribute('aria-valuenow', '50')

    fireEvent.keyDown(sep, { key: 'ArrowRight' })
    expect(sep).toHaveAttribute('aria-valuenow', '55')
    fireEvent.keyDown(sep, { key: 'End' })
    expect(sep).toHaveAttribute('aria-valuenow', '90')
    fireEvent.keyDown(sep, { key: 'PageDown' })
    expect(sep).toHaveAttribute('aria-valuenow', '90')
    fireEvent.keyDown(sep, { key: 'Home' })
    expect(sep).toHaveAttribute('aria-valuenow', '10')
    expect(sep).toHaveAttribute('aria-valuemin', '10')
    expect(sep).toHaveAttribute('aria-valuemax', '90')
    expect(onRatioChange).toHaveBeenLastCalledWith(0.1)
  })

  it('arrastar com ponteiro move o divisor dentro dos limites', () => {
    mockSize(1000, 600)
    renderPane()
    const sep = screen.getByRole('separator')
    fireEvent.pointerDown(sep, { button: 0, pointerId: 1, clientX: 500 })
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 300 })
    expect(sep).toHaveAttribute('aria-valuenow', '30')
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 990 })
    expect(sep).toHaveAttribute('aria-valuenow', '90')
    fireEvent.pointerUp(sep, { pointerId: 1 })
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 200 })
    expect(sep).toHaveAttribute('aria-valuenow', '90')
  })

  it('empilha abaixo da largura configurada e volta ao lado a lado ao crescer', () => {
    const spy = mockSize(400, 800)
    const { container } = renderPane({ stackBelow: 600 })
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('data-orientation', 'vertical')
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')

    spy.mockReturnValue({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(root).toHaveAttribute('data-orientation', 'horizontal')
  })
})
