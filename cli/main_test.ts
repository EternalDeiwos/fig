import { main } from './main.ts'

Deno.test(function addTest() {
  main({ _: [], foo: 'baz' })
})
