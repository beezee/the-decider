import * as daggy from 'daggy';
import './App.css';
import React, { Component } from 'react';
import ReactDataSheet from 'react-datasheet';
import 'react-datasheet/lib/react-datasheet.css';
import * as R from 'ramda';

// foldMap :: Monoid b -> (a -> b) -> [a] -> b
const foldMap = (m) => (f) =>
  R.reduce((b, a) => m.mappend(b, f(a)), m.zero);

// Obj Monoid
const ObjM = daggy.tagged('ObjM', ['x']);
ObjM.mappend = (ma, mb) => ObjM(R.merge(ma.x, mb.x));
ObjM.zero = ObjM({});

// Arr Monoid
const ArrM = daggy.tagged('ArrM', ['x']);
ArrM.mappend = (ma, mb) => ArrM(R.concat(ma.x, mb.x));
ArrM.zero = ArrM([]);

// Add Monoid
const AddM = daggy.tagged('AddM', ['x']);
AddM.mappend = (ma, mb) => AddM(ma.x + mb.x);
AddM.zero = AddM(0);

// Tuple Monoid
/*const TupleM = (M1, M2) => {
  const r = daggy.tagged(
    `(${M1.toString()}, ${M2.toString()})`, 
    ['x', 'y']);
  r.mappend = (mma , mmb) => 
    r(M1.mappend(mma.x, mmb.x), 
       M2.mappend(mma.y, mmb.y));
  r.zero = r(M1.zero, M2.zero);
  return r;
}

const ArrObj = TupleM(ArrM, ObjM);*/

/* data InputField v = 
  FCWeight string string v |
  ChWeight string v */
const InputField = daggy.taggedSum('InputField', {
  FCWeight: ['factor', 'concern', 'value'],
  FWeight: ['factor', 'value'],
  FCScore: ['factor', 'choice', 'value']
});

const storePath = (input) =>
  input.cata({
    FCWeight: (factor, concern) => ['fcWeights', factor, concern],
    FWeight: choice => ['fWeights', choice],
    FCScore: (factor, choice) => ['fcScores', factor, choice]
  });

const fcWeightGrid = (state) =>
  R.map(c =>
   R.compose(
     R.prepend({readOnly: true, value: c}),
     R.append({readOnly: true, value: concernTotal(c, state)}))(
    R.map(f =>
     InputField.FCWeight(f, c, 
       R.pathOr(1)([f, c])(state.fcWeights)))(
     state.factors)))(
   state.concerns);

const fWeightRow = (state) =>
  R.prepend({readOnly: true, value: "Factor Weights"})(
    R.map(
      (f) => InputField.FWeight(f, 
        R.propOr(1)(f)(state.fWeights)))(
      state.factors));

const rowTotal = (ix, sk, state) => 
  foldMap(AddM)(f =>
    AddM(R.pathOr(1)([f, ix])(state[sk]) *
         R.propOr(1)(f)(state.fWeights)))(state.factors).x;

const choiceTotal = (c, state) =>
  rowTotal(c, 'fcScores', state);

const concernTotal = (c, state) =>
  rowTotal(c, 'fcWeights', state);

const choiceScores = (state) =>
  R.map(c =>
    R.compose(
      R.prepend({readOnly: true, value: `${c} Scores`}),
      R.append({readOnly: true, value: choiceTotal(c, state)}))(
        R.map((f) => InputField.FCScore(f, c,
          R.pathOr(1)([f, c])(state.fcScores)))(
        state.factors)))(
    state.choices);

const headers = (state) =>
  R.compose(
    R.prepend({readOnly: true, value: ""}),
    R.append({readOnly: true, value: "Totals"}))(
    R.map((f) => ({readOnly: true, value: f}))(state.factors));

const sep = (state) =>
  R.repeat({readOnly: true, value: ""})(state.factors.length + 2);

const grid = (state) =>
  R.compose(
    R.prepend(headers(state)), 
    R.prepend(sep(state)),
    R.flip(R.concat)(choiceScores(state)),
    R.append(sep(state)),
    R.append(fWeightRow(state)))(fcWeightGrid(state));

class App extends Component {
  state = {
    factors: ['foo', 'bar'],
    concerns: ['baz', 'quux'],
    choices: ['a', 'b'],
    fcWeights: {},
    fWeights: {},
    fcScores: {}
  };

  render() {
    return (
      <div className="App">
        <ReactDataSheet
          data={grid(this.state)}
          valueRenderer={(cell) => cell.value}
          onCellsChanged={changes => {
            const upd = foldMap(ObjM)((o) =>
              ObjM(R.set(
                R.lensPath(storePath(o.cell)), 
                parseInt(o.value))({})))(changes);
            this.setState(ObjM.mappend(
              ObjM(this.state),
              upd).x);
          }}
        />
      </div>
    );
  }
}

export default App;
