import * as daggy from 'daggy';
import './App.css';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import React, { Component } from 'react';
import ReactDataSheet from 'react-datasheet';
import 'react-datasheet/lib/react-datasheet.css';
import * as R from 'ramda';
import NumericInput from 'react-numeric-input';

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

// Mult Monoid
const MultM = daggy.tagged('MultM', ['x']);
MultM.mappend = (ma, mb) => MultM(ma.x * mb.x);
MultM.zero = MultM(1);

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

// Monoid v => Map[k, Monoid v] Monoid
const KV = (m) => {
  const r = daggy.tagged('K -> ' + m.toString(), ['x']);
  r.mappend = (kva , kvb) => 
    r(R.mergeWith((x, y) => m.mappend(x, y))(kva.x)(kvb.x));
  r.zero = r({});
  return r;
}

// Monoid Map[String, AddM]
const ObjAddM = KV(AddM);

/* data InputField v = 
  FCWeight string string v |
  ChWeight string v */
const InputField = daggy.taggedSum('InputField', {
  FCWeight: ['factor', 'concern', 'value'],
  FWeight: ['factor', 'value'],
  FCScore: ['factor', 'choice', 'value']
});

const storePath = {
  FCWeight: (factor, concern) => ['fcWeights', factor, concern],
  FWeight: choice => ['fWeights', choice],
  FCScore: (factor, choice) => ['fcScores', factor, choice]
};

const editorParams = {
  FCWeight: () => [0, 5],
  FWeight: () => [1, 5],
  FCScore: () => [-5, 5]
};

const fcWeightGrid = (state) =>
  R.map(c =>
   R.compose(
     R.prepend({readOnly: true, value: c}),
     R.append({readOnly: true, value: concernTotal(c, state)}))(
    R.map(f =>
     InputField.FCWeight(f, c, 
       R.pathOr(0)([f, c])(state.fcWeights)))(
     state.factors)))(
   state.concerns);

const fWeightRow = (state) =>
  R.compose(
    R.append({readOnly: true, value: ""}),
    R.prepend({readOnly: true, value: "Factor Weights"}))(
    R.map(
      (f) => InputField.FWeight(f, 
        R.propOr(1)(f)(state.fWeights)))(
      state.factors));

const breakDown = (fn) => (state) => 
  R.compose(
    R.map(R.zipObj(['name', 'value'])),
    R.toPairs,
    R.map(R.prop('x')))(
      foldMap(ObjAddM)(f =>
        ObjAddM(foldMap(ObjM)(c => 
          ObjM(R.objOf(c, AddM(MultM.mappend(
            MultM(R.pathOr(AddM.zero.x)([f, c])(state.fcWeights)),
            foldMap(MultM)(i => MultM(i))(fn(f))).x))))(
          state.concerns).x))(
        state.factors).x);

const choiceBreakdowns = (state) =>
  R.fromPairs(R.map(c => [c, breakDown(
      f => [R.propOr(1)(f)(state.fWeights),
            R.pathOr(0)([f, c])(state.fcScores)])(state)])(
    state.choices));

const concernBreakdown = (state) =>
  breakDown((f) => [R.propOr(1)(f)(state.fWeights)])(state);

const reduceTotal = (m) => (fn) => (state) => 
  foldMap(m)(f =>
    m(fn(f, R.propOr(1)(f)(state.fWeights))))(state.factors).x;

const rowTotal = (ix, sk, state) =>
  reduceTotal(AddM)((f, i) =>
    R.pathOr(0)([f, ix])(state[sk]) * i)(state);

const choiceFactorBreakdowns = (state) =>
  foldMap(ObjM)(c => 
    ObjM(R.objOf(c,
      R.compose(
        R.map(R.zipObj(['name', 'value'])),
        R.toPairs)(
      R.map(R.prop('x'))(reduceTotal(ObjAddM)((f, i) =>
        R.objOf(f, AddM(i * R.pathOr(0)([f, c])(state.fcScores))))(
        state))))))(state.choices).x;

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
          R.pathOr(0)([f, c])(state.fcScores)))(
        state.factors)))(
    state.choices);

const headers = (state) =>
  R.compose(
    R.prepend({readOnly: true, width: '10em', value: ""}),
    R.append({readOnly: true, width: '10em', value: "Totals"}))(
    R.map((f) => ({readOnly: true, width: '10em', value: f}))(state.factors));

const sep = (state) =>
  R.repeat({readOnly: true, value: ""})(state.factors.length + 2);

const grid = (state) =>
  R.compose(
    R.prepend(headers(state)), 
    R.prepend(sep(state)),
    R.flip(R.concat)(choiceScores(state)),
    R.append(sep(state)),
    R.append(fWeightRow(state)),
    R.append(sep(state)))(fcWeightGrid(state));

const log = R.tap(console.log);
class App extends Component {
  colors = R.map(_ => 
    '#'+Math.floor(Math.random()*16777215).toString(16))(
    R.repeat(null)(100));

  state = {
    factors: ['foo', 'bar'],
    concerns: ['baz', 'quux'],
    choices: ['a', 'b'],
    fcWeights: {},
    fWeights: {},
    fcScores: {},
    colors: () => this.colors
  };

  render() {
    console.log(choiceFactorBreakdowns(this.state));
    return (
      <div className="App">
        <ReactDataSheet
          data={grid(this.state)}
          width={10}
          valueRenderer={R.prop('value')}
          dataEditor={(props) => {
            const [min, max] = props.cell.cata(editorParams);
            return (<NumericInput min={min} max={max} step={1} 
              value={props.value}
              onChange={(v) => 
                props.onChange(R.max(min, R.min(max, v)))} />); }}
          onCellsChanged={changes => {
            const upd = foldMap(ObjM)((o) =>
              ObjM(R.set(
                R.lensPath(o.cell.cata(storePath)), 
                parseInt(o.value))({})))(changes);
            this.setState(R.mergeDeepRight(
              this.state,
              upd.x));
          }}
        />
        <div style={{
            marginTop: '4em', minWidth: '30em', 
            minHeight: '20em'}}>
          <PieChart width={300} height={200}>
            <Pie title="Prioritization of concerns"
              data={concernBreakdown(this.state)} 
              dataKey='value'
              cx={50} cy={50} innerRadius={10} 
              outerRadius={20} fill="#82ca9d">
                {concernBreakdown(this.state)
                  .map((_, i) => 
                    (<Cell key={i}
                      fill={this.colors[i % this.colors.length]}
                     />))}
            </Pie>
            {R.toPairs(choiceBreakdowns(this.state)).map((e, i) =>
              (<Pie key={`cb-${i}`}
                data={R.map(
                  R.over(R.lensProp('name'))(
                    (s) => `${s}->${e[0]}`))(e[1])}
                dataKey='value'
                cx={150+(50*i)} cy={50} innerRadius={10} 
                outerRadius={20} fill="#82ca9d">
                  {e[1].map((_, i) => 
                      (<Cell  key={`c-${i}`}
                        fill={this.colors[i % this.colors.length]}
                       />))}
              </Pie >))}
            <Tooltip />
           </PieChart>
        </div>
      </div>
    );
  }
}

export default App;
